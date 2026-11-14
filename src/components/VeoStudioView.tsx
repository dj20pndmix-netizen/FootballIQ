import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Sparkles,
  Play,
  RefreshCw,
  Film,
  CheckCircle2,
  AlertCircle,
  Download,
  Ratio,
} from 'lucide-react';
import { Fixture, VideoGenerationJob } from '../types/football';
import { UserProfile, db } from '../services/firebase';
import { doc, setDoc } from 'firebase/firestore';
import stadiumAerialImg from '../assets/images/stadium_floodlights_aerial_1794637004221.jpg';
import matchActionImg from '../assets/images/match_goal_action_1794637005757.jpg';
import tunnelWalkoutImg from '../assets/images/player_tunnel_walkout_1794637006091.jpg';

interface VeoStudioViewProps {
  selectedFixture: Fixture | null;
  user: UserProfile | null;
}

const TEMPLATE_IMAGES = [
  {
    title: 'Floodlit Stadium Atmosphere',
    url: stadiumAerialImg,
    prompt:
      'Cinematic sweeping drone shot above the floodlit football stadium, electric night atmosphere with vibrant fans and green pitch',
  },
  {
    title: 'Dramatic Match Action',
    url: matchActionImg,
    prompt:
      'Slow-motion broadcast camera following a striker volleying toward goal under bright stadium floodlights and rain',
  },
  {
    title: 'Tunnel Walkout & Pitch Inspection',
    url: tunnelWalkoutImg,
    prompt:
      'Steadicam tracking shot emerging from the player tunnel out onto the pristine grass pitch toward bright stadium floodlights',
  },
];

async function imageUrlToDataUrl(url: string): Promise<{ base64DataUrl: string; mimeType: string }> {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);base64,/i);
    return {
      base64DataUrl: url,
      mimeType: match?.[1] || 'image/jpeg',
    };
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Could not read reference visual for Veo encoding.');
  }
  const blob = await response.blob();
  const mimeType = blob.type || 'image/jpeg';
  const base64DataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Failed to encode image bytes.'));
    };
    reader.onerror = () => reject(new Error('Failed to read visual file.'));
    reader.readAsDataURL(blob);
  });
  return { base64DataUrl, mimeType };
}

export const VeoStudioView: React.FC<VeoStudioViewProps> = ({
  selectedFixture,
  user,
}) => {
  const [selectedImage, setSelectedImage] = useState<string>(TEMPLATE_IMAGES[0].url);
  const [imageLoadFailed, setImageLoadFailed] = useState<boolean>(false);
  const [prompt, setPrompt] = useState<string>(
    selectedFixture
      ? `Cinematic pre-match preview motion for ${selectedFixture.homeTeam.name} vs ${selectedFixture.awayTeam.name} at ${selectedFixture.venue}, stadium floodlights illuminating the pitch.`
      : TEMPLATE_IMAGES[0].prompt
  );
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationStatus, setGenerationStatus] = useState<string>('');
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentJobs, setRecentJobs] = useState<VideoGenerationJob[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<number | null>(null);
  const mountedRef = useRef<boolean>(true);

  const clearPollTimer = () => {
    if (pollIntervalRef.current !== null) {
      window.clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPollTimer();
    };
  }, []);

  // Sync prompt when user launches Veo Studio from a new fixture
  useEffect(() => {
    if (selectedFixture) {
      setPrompt(
        `Cinematic pre-match preview motion for ${selectedFixture.homeTeam.name} vs ${selectedFixture.awayTeam.name} at ${selectedFixture.venue}, stadium floodlights illuminating the pitch.`
      );
    }
  }, [selectedFixture?.id]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select a valid image file (PNG, JPG, WebP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setSelectedImage(event.target.result);
        setImageLoadFailed(false);
        setError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const saveGenerationRecord = async (videoUrl: string) => {
    const job: VideoGenerationJob = {
      id: `veo-${Date.now()}`,
      userId: user?.uid || 'guest-user',
      prompt,
      aspectRatio,
      status: 'completed',
      videoUrl,
      previewImageUrl: selectedImage.startsWith('data:') ? undefined : selectedImage,
      createdAt: new Date().toISOString(),
    };

    if (mountedRef.current) {
      setRecentJobs((prev) => [job, ...prev]);
    }

    if (user) {
      try {
        await setDoc(doc(db, 'video_generations', job.id), {
          id: job.id,
          userId: user.uid,
          prompt: job.prompt.slice(0, 990),
          aspectRatio: job.aspectRatio,
          status: 'completed',
          videoUrl: job.videoUrl,
          model: 'veo-3.1-fast-generate-preview',
          createdAt: job.createdAt,
        });
      } catch (err) {
        console.warn('Could not persist video generation to Firestore:', err);
      }
    }
  };

  const handleGenerate = async () => {
    clearPollTimer();
    setIsGenerating(true);
    setError(null);
    setGeneratedVideoUrl(null);
    setGenerationStatus('Preparing visual frame and initializing Veo 3.1...');

    try {
      const encoded = await imageUrlToDataUrl(selectedImage);

      const response = await fetch('/api/veo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          imageBase64: encoded.base64DataUrl,
          mimeType: encoded.mimeType,
          aspectRatio,
        }),
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start video generation');
      }

      if (!mountedRef.current) return;

      if (data.videoUrl) {
        setGeneratedVideoUrl(data.videoUrl);
        await saveGenerationRecord(data.videoUrl);
        setIsGenerating(false);
        return;
      }

      if (!data.operationName) {
        throw new Error('Veo did not return an operation identifier or video URL. Please verify Gemini API key permissions.');
      }

      setGenerationStatus('Veo model is synthesizing cinematic camera motion...');
      let attempts = 0;
      const maxAttempts = 30;
      const opName = String(data.operationName);

      pollIntervalRef.current = window.setInterval(async () => {
        attempts++;
        if (!mountedRef.current) {
          clearPollTimer();
          return;
        }
        setGenerationStatus(
          `Rendering frames with veo-3.1-fast-generate-preview... (${attempts * 4}s)`
        );

        try {
          const statusRes = await fetch(`/api/veo/status/${encodeURIComponent(opName)}`);
          const statusData = await statusRes.json();

          if (!mountedRef.current) return;

          if (!statusRes.ok && statusData?.error) {
            clearPollTimer();
            setError(statusData.error);
            setIsGenerating(false);
            return;
          }

          if (statusData.done && statusData.videoUrl) {
            clearPollTimer();
            setGeneratedVideoUrl(statusData.videoUrl);
            await saveGenerationRecord(statusData.videoUrl);
            setIsGenerating(false);
          } else if (statusData.done && !statusData.videoUrl) {
            clearPollTimer();
            setError('Veo operation finished without a downloadable video output. Please retry with a refined prompt.');
            setIsGenerating(false);
          } else if (attempts >= maxAttempts) {
            clearPollTimer();
            setError('Veo video rendering timed out after 120 seconds. Please try again shortly.');
            setIsGenerating(false);
          }
        } catch (pollErr: any) {
          if (attempts >= maxAttempts) {
            clearPollTimer();
            if (mountedRef.current) {
              setError(pollErr?.message || 'Error polling Veo generation status.');
              setIsGenerating(false);
            }
          }
        }
      }, 4000);
    } catch (err: any) {
      clearPollTimer();
      if (mountedRef.current) {
        setError(err.message || 'Error executing video generation');
        setIsGenerating(false);
      }
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-purple-950/60 via-slate-900 to-slate-950 border border-purple-800/40 relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-bold uppercase tracking-wider text-purple-300">
              Veo 3.1 Fast Generate Preview
            </span>
            <span className="text-slate-600" aria-hidden="true">·</span>
            <span className="text-slate-400">Match Animation Studio</span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Animate Football Visuals into Cinematic Video
          </h2>
          <p className="text-sm text-slate-300">
            Upload a match photo, stadium snapshot, or team visual, and transform it into dynamic, broadcast-grade video reels with Google Veo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Control Panel: Upload, Aspect Ratio, Prompt */}
        <div className="lg:col-span-6 space-y-6">
          {/* 1. Image Selection */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Upload className="w-4 h-4 text-purple-400" />
                1. Select or Upload Photo
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-purple-400 hover:text-purple-300 font-semibold"
              >
                Upload Custom Image
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            {/* Selected image preview */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-800 aspect-video bg-slate-950 group">
              {imageLoadFailed ? (
                <div className="w-full h-full bg-gradient-to-br from-slate-900 via-purple-950/30 to-slate-950 flex flex-col items-center justify-center p-4 text-center">
                  <Film className="w-8 h-8 text-purple-400 mb-2" />
                  <span className="text-xs text-slate-300 font-medium">Reference frame ready</span>
                </div>
              ) : (
                <img
                  src={selectedImage}
                  alt="Selected reference visual"
                  referrerPolicy="no-referrer"
                  onError={() => setImageLoadFailed(true)}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-3 pointer-events-none">
                <span className="text-xs text-white/90 font-medium truncate">
                  Visual source for Veo frame motion synthesis
                </span>
              </div>
            </div>

            {/* Quick Templates */}
            <div>
              <span className="text-xs text-slate-400 block mb-2">Or choose a pre-loaded stadium visual:</span>
              <div className="grid grid-cols-3 gap-2">
                {TEMPLATE_IMAGES.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelectedImage(t.url);
                      setImageLoadFailed(false);
                      setPrompt(t.prompt);
                    }}
                    className={`relative rounded-xl overflow-hidden border aspect-video transition-all ${
                      selectedImage === t.url
                        ? 'ring-2 ring-purple-500 border-purple-500'
                        : 'border-slate-800 opacity-70 hover:opacity-100'
                    }`}
                    title={t.title}
                  >
                    <img
                      src={t.url}
                      alt={t.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 2. Aspect Ratio Selector */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
            <label className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Ratio className="w-4 h-4 text-purple-400" />
              2. Aspect Ratio (Required: 16:9 or 9:16)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAspectRatio('16:9')}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  aspectRatio === '16:9'
                    ? 'bg-purple-950/60 border-purple-500 text-purple-300 font-bold shadow-lg shadow-purple-950/50'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs uppercase tracking-wider font-mono">16:9 Landscape</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Desktop &amp; Broadcast Displays</div>
              </button>

              <button
                type="button"
                onClick={() => setAspectRatio('9:16')}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  aspectRatio === '9:16'
                    ? 'bg-purple-950/60 border-purple-500 text-purple-300 font-bold shadow-lg shadow-purple-950/50'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <div className="text-xs uppercase tracking-wider font-mono">9:16 Portrait</div>
                <div className="text-[11px] text-slate-500 mt-0.5">Mobile Reels &amp; Stories</div>
              </button>
            </div>
          </div>

          {/* 3. Prompt & Generate Button */}
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <label className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" />
              3. Cinematic Motion Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              className="w-full rounded-2xl bg-slate-950 border border-slate-800 p-3 text-xs text-slate-200 focus:outline-none focus:border-purple-500 resize-none"
              placeholder="Describe camera movement, lighting, action, and atmosphere..."
            />

            {error && (
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-500 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-sm shadow-xl shadow-purple-950/60 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Video with Veo...</span>
                </>
              ) : (
                <>
                  <Film className="w-4 h-4" />
                  <span>Generate Veo 3.1 Match Video</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Output Screen: Video Player & History */}
        <div className="lg:col-span-6 space-y-6">
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-4">
            <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Play className="w-4 h-4 text-emerald-400" />
              Generated Cinematic Video Output
            </h3>

            {isGenerating ? (
              <div
                className={`w-full rounded-2xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center p-8 text-center space-y-4 ${
                  aspectRatio === '9:16' ? 'aspect-[9/16] max-w-xs mx-auto' : 'aspect-video'
                }`}
              >
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
                <div className="space-y-1">
                  <h4 className="font-bold text-white text-sm">Veo Model Generating Video</h4>
                  <p className="text-xs text-slate-400 max-w-xs">{generationStatus}</p>
                </div>
              </div>
            ) : generatedVideoUrl ? (
              <div className="space-y-4">
                <div
                  className={`rounded-2xl overflow-hidden bg-black border border-purple-900/50 shadow-2xl ${
                    aspectRatio === '9:16' ? 'aspect-[9/16] max-w-xs mx-auto' : 'aspect-video'
                  }`}
                >
                  <video
                    src={generatedVideoUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-400">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Video Ready ({aspectRatio})
                    </span>
                  </div>
                  <a
                    href={generatedVideoUrl}
                    target="_blank"
                    rel="noreferrer"
                    download="veo-match-preview.mp4"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 hover:text-white transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download MP4</span>
                  </a>
                </div>
              </div>
            ) : (
              <div
                className={`w-full rounded-2xl bg-slate-950 border border-dashed border-slate-800 flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-2 ${
                  aspectRatio === '9:16' ? 'aspect-[9/16] max-w-xs mx-auto' : 'aspect-video'
                }`}
              >
                <Film className="w-10 h-10 text-slate-700" />
                <p className="text-xs text-slate-400 font-medium">Ready to animate</p>
                <p className="text-[11px] text-slate-500 max-w-xs">
                  Configure photo visual and prompt on the left, then click Generate to synthesize a Veo video reel.
                </p>
              </div>
            )}
          </div>

          {/* History of Recent Generations */}
          {recentJobs.length > 0 && (
            <div className="p-6 rounded-3xl bg-slate-900/90 border border-slate-800 space-y-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Session Generation Records
              </h4>
              <div className="space-y-2">
                {recentJobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => job.videoUrl && setGeneratedVideoUrl(job.videoUrl)}
                    className="w-full text-left flex items-center justify-between p-3 rounded-2xl bg-slate-950 hover:bg-slate-900 border border-slate-800 cursor-pointer transition-colors text-xs"
                  >
                    <div className="flex items-center gap-3 truncate">
                      <div className="w-8 h-8 rounded-lg bg-purple-950 text-purple-400 flex items-center justify-center shrink-0">
                        <Film className="w-4 h-4" />
                      </div>
                      <div className="truncate">
                        <p className="font-semibold text-slate-200 truncate">{job.prompt}</p>
                        <span className="text-[10px] text-slate-500 font-mono">
                          {job.aspectRatio} · {new Date(job.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-400 font-bold shrink-0">
                      View
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
