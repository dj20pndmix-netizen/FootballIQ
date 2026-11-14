import React, { useState, useEffect } from 'react';
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);

  // States
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Verification resend cooldown
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (user && !user.emailVerified) {
      setMode('verify_pending');
      if (user.email && !email) {
        setEmail(user.email);
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
    setMode(newMode);
  };

  // 1. Sign In With Email & Password
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!email.trim() || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    try {
      setIsLoading(true);
      const profile = await signInWithEmail(email, password);
      if (!profile.emailVerified) {
        setMode('verify_pending');
        setSuccessMessage('Please verify your email address to complete signing in.');
      } else {
        onAuthSuccess(profile);
      }
    } catch (err: any) {
      setErrorMessage(formatAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Sign Up (Create Account) With Mandatory Verification
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!displayName.trim()) {
      setErrorMessage('Please enter your full name or analyst alias.');
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
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please re-enter your password.');
      return;
    }
    if (!agreeTerms) {
      setErrorMessage('You must agree to the Terms of Service and Privacy Policy to create an account.');
      return;
    }

    try {
      setIsLoading(true);
      const profile = await signUpWithEmail(displayName, email, password);
      // Account created and verification email sent
      setMode('verify_pending');
      setResendCooldown(60);
      setSuccessMessage(
        `Account created successfully! A verification link has been sent to ${email}. Please check your inbox and verify your email before accessing the platform.`
      );
      if (profile.emailVerified) {
        onAuthSuccess(profile);
      }
    } catch (err: any) {
      setErrorMessage(formatAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 3. Send Password Reset Link
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();

    if (!email.trim()) {
      setErrorMessage('Please enter your email address to receive the password reset link.');
      return;
    }

    try {
      setIsLoading(true);
      await sendResetPasswordEmail(email);
      setSuccessMessage(
        `A password reset link has been dispatched to ${email}. Check your inbox and follow the instructions to create a new password.`
      );
    } catch (err: any) {
      setErrorMessage(formatAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 4. Check If Email Is Verified
  const handleCheckVerification = async () => {
    clearFeedback();
    try {
      setIsLoading(true);
      const isVerified = await reloadUserAndCheckVerification();
      if (isVerified) {
        setSuccessMessage('Email verified successfully! Logging you in...');
        if (user) {
          onAuthSuccess({ ...user, emailVerified: true });
        } else {
          // If we had credentials, sign in or let user log in
          setMode('signin');
          setSuccessMessage('Email verified! You can now sign in with your credentials.');
        }
      } else {
        setErrorMessage(
          'Email not yet verified. Please click the verification link sent to your inbox, then click "I\'ve Verified My Email" again.'
        );
      }
    } catch (err: any) {
      setErrorMessage(formatAuthErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  };

  // 5. Resend Verification Email
  const handleResendVerification = async () => {
    if (resendCooldown > 0) return;
    clearFeedback();
    try {
      setIsLoading(true);
      await resendVerificationEmail();
      setResendCooldown(60);
      setSuccessMessage(`A fresh verification email has been sent to ${email || user?.email}.`);
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
      const profile = await signInWithGoogle(email, displayName);
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
      setConfirmPassword('');
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
            <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-start gap-2.5 animate-fadeIn">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-start gap-2.5 animate-fadeIn">
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
                      className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
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
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 p-0.5"
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
          {/* MODE: SIGN UP (CREATE ACCOUNT) */}
          {/* ------------------------------------------------------------- */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="space-y-1">
                <h2 className="text-lg font-bold text-white tracking-tight">Create FootballIQ Account</h2>
                <p className="text-xs text-slate-400">
                  Register with your email to unlock all world leagues and tactical models.
                </p>
              </div>

              <div className="space-y-3 pt-2">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Full Name / Alias
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="Alex Morgan"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      placeholder="alex@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Password (min. 6 chars)
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
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 p-0.5"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300 p-0.5"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-start gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreeTerms}
                    onChange={(e) => setAgreeTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-800 text-emerald-600 focus:ring-0 focus:ring-offset-0 bg-slate-950 cursor-pointer"
                  />
                  <span className="text-[11px] text-slate-400 leading-tight">
                    I agree to the Terms of Service, email verification, and responsible intelligence policy.
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer mt-2"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Creating Account &amp; Sending Verification...</span>
                  </>
                ) : (
                  <>
                    <span>Create Account &amp; Verify Email</span>
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
          {/* MODE: FORGOT PASSWORD */}
          {/* ------------------------------------------------------------- */}
          {mode === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-1">
                <div className="w-10 h-10 rounded-xl bg-emerald-950/60 border border-emerald-800/60 flex items-center justify-center mb-2">
                  <KeyRound className="w-5 h-5 text-emerald-400" />
                </div>
                <h2 className="text-lg font-bold text-white tracking-tight">Reset Your Password</h2>
                <p className="text-xs text-slate-400">
                  Enter your registered email address and we&apos;ll send you a password reset link to create a new password.
                </p>
              </div>

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
                    <span>Sending Reset Link...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Send Password Reset Link</span>
                  </>
                )}
              </button>

              <div className="pt-3 text-center">
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

          {/* ------------------------------------------------------------- */}
          {/* MODE: EMAIL VERIFICATION GATE */}
          {/* ------------------------------------------------------------- */}
          {mode === 'verify_pending' && (
            <div className="space-y-5 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400">
                <Mail className="w-7 h-7" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-lg font-bold text-white tracking-tight">Verify Your Email Address</h2>
                <p className="text-xs text-slate-300 leading-relaxed">
                  To protect predictive intelligence data and activate your account, please verify your email address.
                </p>
                <div className="inline-block px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400">
                  {email || user?.email || 'Your registered email'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 text-left space-y-1.5 text-xs text-slate-400">
                <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Next Steps:</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 pl-1 text-[11px] leading-relaxed">
                  <li>Check your email inbox (and spam/junk folder) for the verification link.</li>
                  <li>Click the link in the email to verify your address.</li>
                  <li>Click the button below to confirm and enter FootballIQ.</li>
                </ol>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleCheckVerification}
                  disabled={isLoading}
                  className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Checking Status...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>I&apos;ve Verified My Email</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={isLoading || resendCooldown > 0}
                  className="w-full py-2 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 disabled:opacity-50 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>
                    {resendCooldown > 0
                      ? `Resend available in ${resendCooldown}s`
                      : 'Resend Verification Email'}
                  </span>
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
