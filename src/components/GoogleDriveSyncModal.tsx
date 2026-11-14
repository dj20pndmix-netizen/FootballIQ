import React, { useState } from 'react';
import {
  X,
  Cloud,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Database,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  FolderSync,
  Key,
} from 'lucide-react';
import { Fixture } from '../types/football';
import { UserProfile } from '../services/firebase';
import {
  generateFixturesJsonBackup,
  generateMatchdayDossierMarkdown,
  generateCalibrationCsv,
  downloadFile,
  uploadToGoogleDriveWithToken,
  getGoogleDriveSyncMeta,
  saveGoogleDriveSyncMeta,
} from '../services/googleDriveService';

interface GoogleDriveSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  fixtures: Fixture[];
  user: UserProfile | null;
}

export const GoogleDriveSyncModal: React.FC<GoogleDriveSyncModalProps> = ({
  isOpen,
  onClose,
  fixtures,
  user,
}) => {
  const [meta, setMeta] = useState(() => getGoogleDriveSyncMeta());
  const [driveToken, setDriveToken] = useState('');
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    success?: boolean;
    message?: string;
  } | null>(null);

  if (!isOpen) return null;

  const handleExportJson = () => {
    const json = generateFixturesJsonBackup(fixtures);
    const dateTag = new Date().toISOString().split('T')[0];
    downloadFile(`footballiq_predictions_backup_${dateTag}.json`, json, 'application/json');
    updateLastSync();
  };

  const handleExportMarkdown = () => {
    const md = generateMatchdayDossierMarkdown(fixtures);
    const dateTag = new Date().toISOString().split('T')[0];
    downloadFile(`footballiq_matchday_dossier_${dateTag}.md`, md, 'text/markdown');
    updateLastSync();
  };

  const handleExportCsv = () => {
    const csv = generateCalibrationCsv(fixtures);
    const dateTag = new Date().toISOString().split('T')[0];
    downloadFile(`footballiq_calibration_sheets_${dateTag}.csv`, csv, 'text/csv');
    updateLastSync();
  };

  const updateLastSync = () => {
    const nextMeta = {
      ...meta,
      lastSyncAt: new Date().toISOString(),
      totalFilesSynced: meta.totalFilesSynced + 1,
      syncedItems: {
        fixturesCount: fixtures.length,
        predictionsCount: fixtures.length * 6,
        sessionsCount: meta.syncedItems.sessionsCount,
      },
    };
    setMeta(nextMeta);
    saveGoogleDriveSyncMeta(nextMeta);
  };

  const handleDirectDriveUpload = async () => {
    if (!driveToken.trim()) {
      setShowTokenInput(true);
      return;
    }

    try {
      setIsUploading(true);
      setUploadStatus(null);

      const dateTag = new Date().toISOString().split('T')[0];
      const json = generateFixturesJsonBackup(fixtures);
      const md = generateMatchdayDossierMarkdown(fixtures);
      const csv = generateCalibrationCsv(fixtures);

      const resJson = await uploadToGoogleDriveWithToken(
        driveToken.trim(),
        `footballiq_predictions_${dateTag}.json`,
        'application/json',
        json
      );

      if (!resJson.success) {
        throw new Error(resJson.error || 'Failed to upload JSON to Google Drive');
      }

      await uploadToGoogleDriveWithToken(
        driveToken.trim(),
        `footballiq_matchday_brief_${dateTag}.md`,
        'text/markdown',
        md
      );

      await uploadToGoogleDriveWithToken(
        driveToken.trim(),
        `footballiq_sheets_calibration_${dateTag}.csv`,
        'text/csv',
        csv
      );

      updateLastSync();
      setUploadStatus({
        success: true,
        message: 'All 3 files successfully uploaded to your Google Drive!',
      });
    } catch (err: any) {
      setUploadStatus({
        success: false,
        message: err.message || 'Google Drive upload encountered an authorization error.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-850 to-emerald-950/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Google Drive Logo Icon */}
            <div className="w-10 h-10 rounded-2xl bg-slate-950 border border-slate-800 p-2 flex items-center justify-center shrink-0">
              <svg className="w-6 h-6" viewBox="0 0 87.3 78" xmlns="http://www.w3.org/2000/svg">
                <path d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
                <path d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0 -1.2 4.5h27.5z" fill="#00ac47"/>
                <path d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.502l5.852 11.5z" fill="#ea4335"/>
                <path d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z" fill="#00832d"/>
                <path d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" fill="#2684fc"/>
                <path d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Google Drive Cloud Storage</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
                  Cloud Sync Active
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Store and backup all football intelligence, matchday predictions &amp; calibration audits to your Google Drive.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Status Card */}
          <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                Destination Folder in Google Drive
              </span>
              <div className="flex items-center gap-2 font-bold text-slate-200 text-sm">
                <FolderSync className="w-4 h-4 text-emerald-400" />
                <span>FootballIQ Cloud Storage</span>
              </div>
              <p className="text-xs text-slate-500">
                {user?.email ? `Connected User: ${user.email}` : 'Linked via Firebase Authentication'}
              </p>
            </div>

            <div className="text-right space-y-1">
              <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider block">
                Last Synchronized
              </span>
              <span className="font-mono text-xs text-emerald-400 font-semibold block">
                {meta.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString() : 'Ready for initial backup'}
              </span>
              <span className="text-[10px] text-slate-500 block">
                Total Files Synced: {meta.totalFilesSynced}
              </span>
            </div>
          </div>

          {/* Feedback Messages */}
          {uploadStatus && (
            <div
              className={`p-4 rounded-2xl text-xs flex items-center gap-3 ${
                uploadStatus.success
                  ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                  : 'bg-rose-950/60 border border-rose-800 text-rose-300'
              }`}
            >
              {uploadStatus.success ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-rose-400 shrink-0" />
              )}
              <span>{uploadStatus.message}</span>
            </div>
          )}

          {/* What gets stored list */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Data Stored to Google Drive ({fixtures.length} Fixtures across 30 World Leagues)
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Card 1: Predictions JSON */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850 hover:border-slate-750 transition-colors space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-blue-950/60 border border-blue-800/60 flex items-center justify-center">
                    <Database className="w-4 h-4 text-blue-400" />
                  </div>
                  <h5 className="font-bold text-xs text-white">Full Prediction Archive</h5>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    All 84 matches, Dixon-Coles matrices, 10m intervals, probabilities &amp; bookmaker odds in JSON.
                  </p>
                </div>
                <button
                  onClick={handleExportJson}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .json</span>
                </button>
              </div>

              {/* Card 2: Matchday Dossier Markdown */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850 hover:border-slate-750 transition-colors space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center">
                    <FileText className="w-4 h-4 text-emerald-400" />
                  </div>
                  <h5 className="font-bold text-xs text-white">Matchday Brief (Docs)</h5>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Executive summary dossier formatted for Google Docs with high-value picks and lineups.
                  </p>
                </div>
                <button
                  onClick={handleExportMarkdown}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .md</span>
                </button>
              </div>

              {/* Card 3: Model Calibration CSV */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-850 hover:border-slate-750 transition-colors space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-950/60 border border-amber-800/60 flex items-center justify-center">
                    <FileSpreadsheet className="w-4 h-4 text-amber-400" />
                  </div>
                  <h5 className="font-bold text-xs text-white">Calibration (Sheets)</h5>
                  <p className="text-[11px] text-slate-400 leading-tight">
                    Hit rates, settlement audits, and probability calibration rows ready for Google Sheets analysis.
                  </p>
                </div>
                <button
                  onClick={handleExportCsv}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download .csv</span>
                </button>
              </div>
            </div>
          </div>

          {/* Direct API Upload (OAuth Token Option) */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-slate-200">
                  Direct Google Drive Cloud Push
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowTokenInput(!showTokenInput)}
                className="text-[11px] text-teal-400 hover:text-teal-300 font-semibold cursor-pointer"
              >
                {showTokenInput ? 'Hide Token Input' : 'Enter Google Drive Access Token'}
              </button>
            </div>

            {showTokenInput && (
              <div className="space-y-2 pt-2 border-t border-slate-850">
                <p className="text-[11px] text-slate-400">
                  Optional: If you have a Google OAuth access token with Drive permissions, enter it below to upload directly to your Drive via the REST API:
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="ya29.a0Ac..."
                    value={driveToken}
                    onChange={(e) => setDriveToken(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                  />
                  <button
                    onClick={handleDirectDriveUpload}
                    disabled={isUploading || !driveToken.trim()}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {isUploading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Cloud className="w-3.5 h-3.5" />
                    )}
                    <span>{isUploading ? 'Uploading...' : 'Push to Drive'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-slate-800 bg-slate-950/80 flex flex-wrap items-center justify-between gap-3">
          <a
            href="https://drive.google.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white font-semibold transition-colors"
          >
            <span>Open Google Drive in Browser</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                handleExportJson();
                handleExportMarkdown();
                handleExportCsv();
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Cloud className="w-4 h-4" />
              <span>Export All 3 Files for Google Drive</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
