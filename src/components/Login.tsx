import React, { useState } from 'react';
import { Lock, User, LogIn, UserPlus, KeyRound } from 'lucide-react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';

interface LoginProps {
  onLogin: (token: string, user: any) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Use email directly if it contains @, otherwise fake an email using the username
    const email = username.includes('@') 
      ? username.toLowerCase() 
      : `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;

    try {
      if (!auth) throw new Error("Firebase auth is not initialized");
      
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      // The onAuthStateChanged listener in store.ts will handle the actual login state update
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('Sai tên đăng nhập hoặc mật khẩu');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('Tên đăng nhập đã tồn tại');
      } else if (err.code === 'auth/weak-password') {
        setError('Mật khẩu phải có ít nhất 6 ký tự');
      } else if (err.code === 'auth/configuration-not-found') {
        setError('Lỗi cấu hình Firebase: Dự án không tồn tại hoặc thông tin cấu hình (Project ID, App ID) bị sai. Vui lòng kiểm tra lại các biến môi trường.');
      } else {
        setError('Có lỗi xảy ra: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const email = username.includes('@') 
      ? username.toLowerCase() 
      : `${username.toLowerCase().replace(/[^a-z0-9]/g, '')}@example.com`;

    try {
      if (!auth) throw new Error("Firebase auth is not initialized");
      await sendPasswordResetEmail(auth, email);
      setResetSent(true);
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/user-not-found') {
        setError('Không tìm thấy tài khoản với email này');
      } else {
        setError('Có lỗi xảy ra: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (isForgotPassword) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-md">
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <KeyRound className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Khôi phục mật khẩu</h2>
            <p className="text-slate-500 text-center mt-2">
              Nhập email hoặc tên đăng nhập của bạn để nhận liên kết đặt lại mật khẩu
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-medium border border-rose-100">
              {error}
            </div>
          )}

          {resetSent ? (
            <div className="text-center">
              <div className="mb-6 p-4 bg-emerald-50 text-emerald-600 rounded-xl text-sm font-medium border border-emerald-100">
                Email khôi phục mật khẩu đã được gửi! Vui lòng kiểm tra hộp thư của bạn (bao gồm cả thư mục Spam).
              </div>
              <button
                onClick={() => {
                  setIsForgotPassword(false);
                  setResetSent(false);
                  setError('');
                }}
                className="w-full py-3 bg-slate-900 text-white font-medium rounded-xl hover:bg-slate-800 transition-colors"
              >
                Quay lại đăng nhập
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Email / Tên đăng nhập</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Nhập email hoặc tên đăng nhập..."
                    className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-70 flex justify-center items-center"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  'Gửi liên kết khôi phục'
                )}
              </button>

              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                    setError('');
                  }}
                  className="text-sm text-slate-500 font-medium hover:text-slate-700"
                >
                  Quay lại đăng nhập
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
            {isLogin ? <LogIn className="w-8 h-8" /> : <UserPlus className="w-8 h-8" />}
          </div>
          <h2 className="text-2xl font-bold text-slate-800">
            {isLogin ? 'Đăng nhập' : 'Đăng ký tài khoản'}
          </h2>
          <p className="text-slate-500 text-center mt-2">
            {isLogin 
              ? 'Chào mừng bạn quay trở lại hệ thống quản lý' 
              : 'Tạo tài khoản mới để bắt đầu quản lý đơn hàng'}
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-medium border border-rose-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Tên đăng nhập</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Nhập tên đăng nhập..."
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-slate-700">Mật khẩu</label>
              {isLogin && (
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(true);
                    setError('');
                  }}
                  className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                >
                  Quên mật khẩu?
                </button>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Nhập mật khẩu..."
                className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-70 flex justify-center items-center"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              isLogin ? 'Đăng nhập' : 'Đăng ký'
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            className="text-sm text-emerald-600 font-medium hover:text-emerald-700"
          >
            {isLogin ? 'Chưa có tài khoản? Đăng ký ngay' : 'Đã có tài khoản? Đăng nhập'}
          </button>
        </div>
      </div>
    </div>
  );
}
