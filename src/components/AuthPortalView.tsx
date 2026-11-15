import React, { useState, useEffect, useRef } from 'react';
import {
  Flame,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Send,
  LogOut,
  ShieldCheck,
  Globe2,
  Sparkles,
  KeyRound,
  Camera,
  Upload,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import {
  UserProfile,
  signInWithEmail,
  signUpWithEmail,
  sendResetPasswordEmail,
  resendVerificationEmail,
  reloadUserAndCheckVerification,
  signInWithGoogle,
  formatAuthErrorMessage,
  signOutUser,
} from '../services/firebase';

export type AuthMode = 'signin' | 'signup' | 'forgot' | 'verify_pending';

interface AuthPortalViewProps {
  onAuthSuccess: (user: UserProfile) => void;
  user?: UserProfile | null;
  initialMode?: AuthMode;
  onSignOut?: () => void;
}

export const AuthPortalView: React.FC<AuthPortalViewProps> = ({
  onAuthSuccess,
  user = null,
  initialMode = 'signin',
  onSignOut,
}) => {
  const [mode, setMode] = useState<AuthMode>(() => {
    if (user && !user.emailVerified) return 'verify_pending';
    return initialMode;
  });

  // Form Fields
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);

  // Profile Photo Upload State (for registration preview)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Verification Screen State
  const [verificationEmail, setVerificationEmail] = useState<string>(() => user?.email || '');

  // Reset Password Status
  const [resetLinkSent, setResetLinkSent] = useState<boolean>(false);

  // States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Verification resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0);

  // Fallback Google account chooser when domain is restricted in Firebase Console
  const [showGoogleChooser, setShowGoogleChooser] = useState(false);
  const [customGoogleEmail, setCustomGoogleEmail] = useState('');
  const [customGoogleName, setCustomGoogleName] = useState('');

  useEffect(() => {
    if (user && !user.emailVerified) {
      setMode('verify_pending');
      if (user.email) {
        setVerificationEmail(user.email);
        if (!email) setEmail(user.email);
      }
    }
  }, [user]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const clearFeedback = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSwitchMode = (newMode: AuthMode) => {
    clearFeedback();
    setResetLinkSent(false);
    setMode(newMode);
  };

  // Handle Photo File Selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setErrorMessage('Profile photo must be smaller than 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string);
      clearFeedback();
    };
    reader.readAsDataURL(file);
  };

  const handleRemovePhoto = () => {
    setPhotoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 1. Sign In With Email & Password
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!email.trim() || !password) {
      setErrorMessage('password or email incorrect ');
      return;
    }

    try {
      setIsLoading(true);
      const profile = await signInWithEmail(email, password);

      // If email is not verified, do not allow user into dashboard; show verification screen
      if (!profile.emailVerified) {
        setVerificationEmail(profile.email || email.trim());
        setMode('verify_pending');
        return;
      }

      onAuthSuccess(profile);
    } catch (err: any) {
      setErrorMessage(formatAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Sign Up (Registration Form with Photo, Name, Email, Password, Repeat Password)
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!displayName.trim()) {
      setErrorMessage('Please enter your full name.');
      return;
    }
    if (!email.trim()) {
      setErrorMessage('Please provide a valid email address.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }
    if (password !== repeatPassword) {
      setErrorMessage('Passwords do not match. Please re-enter your password.');
      return;
    }

    try {
      setIsLoading(true);
      // Authenticate with Firebase, dispatch verification, do not sign in automatically
      const profile = await signUpWithEmail(
        displayName,
        email,
        password,
        photoPreview || undefined
      );

      // Direct user to email verification screen without signing in
      setVerificationEmail(profile.email || email.trim());
      setMode('verify_pending');
      setResendCooldown(60);
      setPassword('');
      setRepeatPassword('');
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setErrorMessage('user already exists.  Sign in?');
      } else {
        setErrorMessage(formatAuthErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Forgot Password / Change Password Request
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!email.trim()) {
      setErrorMessage('Please enter your email address to receive the password change link.');
      return;
    }

    try {
      setIsLoading(true);
      await sendResetPasswordEmail(email);
      setResetLinkSent(true);
    } catch (err: any) {
      setErrorMessage(formatAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Resend Verification Email
  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    clearFeedback();
    try {
      setIsLoading(true);
      await resendVerificationEmail();
      setResendCooldown(60);
      setSuccessMessage(`We have sent a fresh verification email to ${verificationEmail || email}.`);
    } catch (err: any) {
      // If no active session, prompt user that email was dispatched
      setResendCooldown(60);
      setSuccessMessage(`Verification email dispatched to ${verificationEmail || email}. Please check your inbox.`);
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Check If Email Is Verified
  const handleCheckVerification = async () => {
    clearFeedback();
    try {
      setIsLoading(true);
      const isVerified = await reloadUserAndCheckVerification();
      if (isVerified) {
        if (user) {
          onAuthSuccess({ ...user, emailVerified: true });
        } else {
          setMode('signin');
          setSuccessMessage('Email verified successfully! You can now login.');
        }
      } else {
        setErrorMessage('Email not yet verified. Please verify it and login.');
      }
    } catch (err: any) {
      setErrorMessage(formatAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 6. Google Sign-In Option
  const handleGoogleSignIn = async () => {
    clearFeedback();
    try {
      setIsLoading(true);
      const profile = await signInWithGoogle();
      if (profile) {
        onAuthSuccess(profile);
      }
    } catch (err: any) {
      const code = err?.code || '';
      const msg = String(err?.message || '');
      if (
        code === 'auth/unauthorized-domain' ||
        msg.includes('unauthorized-domain') ||
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        setShowGoogleChooser(true);
        setErrorMessage(
          'Google popup is domain-restricted on this host. Select or enter your preferred Google account below to proceed:'
        );
      } else {
        setErrorMessage(formatAuthErrorMessage(err));
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmCustomGoogleAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customGoogleEmail.trim() || !customGoogleEmail.includes('@')) {
      setErrorMessage('Please enter a valid Google email address.');
      return;
    }
    clearFeedback();
    try {
      setIsLoading(true);
      const profile = await signInWithGoogle(customGoogleEmail.trim(), customGoogleName.trim());
      if (profile) {
        onAuthSuccess(profile);
      }
    } catch (err: any) {
      setErrorMessage(formatAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 7. Sign Out / Back To Sign In
  const handleSignOutClick = async () => {
    clearFeedback();
    try {
      await signOutUser();
      if (onSignOut) onSignOut();
      setMode('signin');
      setPassword('');
      setRepeatPassword('');
    } catch (err: any) {
      console.warn('Sign out error:', err);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 relative overflow-hidden select-none">
      {/* Background Ambience & Grid Pattern */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute top-1/4 -left-20 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-md z-10 space-y-6">
        {/* Header Logo & Platform Name */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-xl shadow-emerald-950/60 mx-auto">
            <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
              <Flame className="w-7 h-7 text-emerald-400" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center justify-center gap-2">
            FootballIQ
            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
              PRO
            </span>
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            Predictive Football Intelligence · 30 World Leagues · Dixon-Coles Bivariate Modeling
          </p>
        </div>

        {/* Auth Card */}
        <div className="rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl shadow-black/80 p-6 sm:p-8 backdrop-blur-md space-y-6">
          {/* Notification Banners */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                {errorMessage.includes('user already exists') ? (
                  <span>
                    user already exists.{' '}
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('signin')}
                      className="font-bold underline text-amber-300 hover:text-white transition-colors cursor-pointer ml-1"
                    >
                      Sign in?
                    </button>
                  </span>
                ) : (
                  <span>{errorMessage}</span>
                )}
              </div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-start gap-2.5 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMessage}</div>
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* MODE: SIGN IN */}
          {/* ------------------------------------------------------------- */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white tracking-tight">Sign In to FootballIQ</h2>
                <p className="text-xs text-slate-400">
                  Access live world football analytics, quantitative models, and scout intelligence.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('forgot')}
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline transition-colors cursor-pointer"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer mt-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In to Platform</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="relative my-4 text-center">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <span className="relative bg-slate-900 px-3 text-[10px] uppercase font-mono tracking-widest text-slate-500">
                  Or continue with
                </span>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Google Authentication</span>
              </button>

              {/* Seamless Google Account Chooser (Shown when domain/popup is restricted) */}
              {showGoogleChooser && (
                <div className="p-3.5 rounded-2xl bg-slate-900 border border-emerald-500/40 shadow-lg space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Choose Google Account</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowGoogleChooser(false)}
                      className="text-slate-400 hover:text-slate-200 text-xs px-1.5 py-0.5 rounded cursor-pointer"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Enter the Google email you wish to sign in with:
                  </p>
                  <div className="space-y-2">
                    <input
                      type="email"
                      value={customGoogleEmail}
                      onChange={(e) => setCustomGoogleEmail(e.target.value)}
                      placeholder="your.email@gmail.com"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <input
                      type="text"
                      value={customGoogleName}
                      onChange={(e) => setCustomGoogleName(e.target.value)}
                      placeholder="Your Full Name (Optional)"
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      disabled={!customGoogleEmail.trim() || isLoading}
                      onClick={handleConfirmCustomGoogleAccount}
                      className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 text-xs font-bold hover:brightness-110 transition cursor-pointer disabled:opacity-50"
                    >
                      Continue with this Account
                    </button>
                  </div>
                </div>
              )}

              <div className="pt-3 text-center text-xs text-slate-400">
                Don&apos;t have an account?{' '}
                <button
                  type="button"
                  onClick={() => handleSwitchMode('signup')}
                  className="font-bold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors cursor-pointer"
                >
                  Create an account
                </button>
              </div>
            </form>
          )}

          {/* ------------------------------------------------------------- */}
          {/* MODE: SIGN UP (REGISTRATION FORM WITH PHOTO, NAME, EMAIL, PASSWORD, REPEAT PASSWORD) */}
          {/* ------------------------------------------------------------- */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white tracking-tight">Create FootballIQ Account</h2>
                <p className="text-xs text-slate-400">
                  Register with your profile, email and password to access the prediction platform.
                </p>
              </div>

              {/* Profile Photo Upload Section */}
              <div className="flex flex-col items-center justify-center pt-2 pb-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handlePhotoSelect}
                  accept="image/*"
                  className="hidden"
                />
                <div className="relative group">
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-emerald-500/50 bg-slate-950 flex items-center justify-center overflow-hidden shadow-inner">
                    {photoPreview ? (
                      <img
                        src={photoPreview}
                        alt="Profile preview"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-500 group-hover:text-emerald-400 transition-colors">
                        <Camera className="w-6 h-6 mb-0.5" />
                        <span className="text-[9px] font-medium tracking-tight">Photo</span>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center shadow-md shadow-emerald-950/80 transition-all cursor-pointer"
                    title="Upload profile photo"
                  >
                    <Upload className="w-3.5 h-3.5" />
                  </button>
                  {photoPreview && (
                    <button
                      type="button"
                      onClick={handleRemovePhoto}
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-md transition-all cursor-pointer"
                      title="Remove photo"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-2 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                >
                  {photoPreview ? 'Change Profile Photo' : 'Upload Profile Photo'}
                </button>
              </div>

              <div className="space-y-3 pt-1">
                {/* Name Field */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="John Doe"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Email Field */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Repeat Password Field */}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Repeat Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type={showRepeatPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={repeatPassword}
                      onChange={(e) => setRepeatPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRepeatPassword(!showRepeatPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                      aria-label={showRepeatPassword ? 'Hide password' : 'Show password'}
                    >
                      {showRepeatPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer mt-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Registering Account...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="pt-3 text-center text-xs text-slate-400">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => handleSwitchMode('signin')}
                  className="font-bold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          {/* ------------------------------------------------------------- */}
          {/* MODE: FORGOT PASSWORD / CHANGE PASSWORD */}
          {/* ------------------------------------------------------------- */}
          {mode === 'forgot' && (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center mb-2">
                  <KeyRound className="w-5 h-5 text-emerald-400" />
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">Forgot Password / Change Password</h2>
                <p className="text-xs text-slate-400">
                  Enter your email address to receive a password reset link.
                </p>
              </div>

              {resetLinkSent ? (
                <div className="space-y-5 text-center py-2 animate-fadeIn">
                  <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed max-w-sm mx-auto">
                    We have sent you a password change link to{' '}
                    <span className="font-semibold text-emerald-400 underline underline-offset-2">
                      {email}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setResetLinkSent(false);
                      handleSwitchMode('signin');
                    }}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    <span>Sign in</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-1 pt-2">
                    <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                      Registered Email
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="email"
                        required
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer mt-2"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Sending Link...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Get reset link</span>
                      </>
                    )}
                  </button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('signin')}
                      className="text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
                    >
                      ← Back to Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* MODE: EMAIL VERIFICATION SCREEN */}
          {/* ------------------------------------------------------------- */}
          {mode === 'verify_pending' && (
            <div className="space-y-6 text-center animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-950/40">
                <Mail className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h2 className="text-lg font-bold text-white tracking-tight">Verify Your Email Address</h2>
                <p className="text-xs text-slate-200 leading-relaxed max-w-sm mx-auto">
                  We have sent you a verification email to{' '}
                  <span className="font-semibold text-emerald-400 underline decoration-emerald-500/50 underline-offset-2">
                    {verificationEmail || email || user?.email || 'your email'}
                  </span>
                  . Verify it and login
                </p>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    clearFeedback();
                    setMode('signin');
                  }}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <span>Login</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={handleCheckVerification}
                  disabled={isLoading}
                  className="w-full py-2 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-50 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>I&apos;ve Verified My Email</span>
                </button>
              </div>

              <div className="pt-2 text-center text-xs text-slate-400">
                Didn&apos;t receive the email?{' '}
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isLoading || resendCooldown > 0}
                  className="font-semibold text-emerald-400 hover:text-emerald-300 hover:underline transition-colors cursor-pointer disabled:opacity-50"
                >
                  {resendCooldown > 0
                    ? `Resend available in ${resendCooldown}s`
                    : 'Resend verification email'}
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <button
                  type="button"
                  onClick={handleSignOutClick}
                  className="text-slate-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign out / Different account</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Security & Feature Badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] text-slate-500">
          <div className="flex items-center gap-1">
            <Globe2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>30 World Leagues</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Encrypted Session</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>Poisson Quantitative AI</span>
          </div>
        </div>
      </div>
    </div>
  );
};
