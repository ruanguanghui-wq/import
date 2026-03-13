import React, { useState } from "react";
import { LogIn } from "lucide-react";
import { auth, db, googleProvider } from "../firebase";
import { signInWithPopup, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

interface LoginProps {
  onLogin: (token: string, user: any) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError("");
    setLoading(true);

    try {
      if (!auth || !db) throw new Error("Firebase is not initialized");

      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const email = user.email;

      if (!email) {
        throw new Error("Không thể lấy email từ tài khoản Google");
      }

      // Check if email is allowed
      const allowedEmailDoc = await getDoc(doc(db, "allowed_emails", email));
      const isAdminEmail = email === "ruanguanghui@gmail.com";

      if (!allowedEmailDoc.exists() && !isAdminEmail) {
        await signOut(auth);
        throw new Error("Tài khoản của bạn không có quyền truy cập hệ thống.");
      }

      // If it's the admin email and not in allowed_emails, add it automatically
      if (isAdminEmail && !allowedEmailDoc.exists()) {
        await setDoc(doc(db, "allowed_emails", email), {
          email: email,
          role: "admin",
          createdAt: new Date().toISOString(),
        });
      }

      // The onAuthStateChanged listener in store.ts will handle the actual login state update
    } catch (err: any) {
      console.error(err);
      if (err.code === "auth/popup-closed-by-user") {
        // User closed the popup, don't show error
      } else if (
        err.code === "auth/operation-not-allowed" ||
        (err.message && err.message.includes("auth/operation-not-allowed"))
      ) {
        setError(
          "Phương thức đăng nhập bằng Google chưa được bật. Vui lòng vào Firebase Console -> Authentication -> Sign-in method -> Thêm nhà cung cấp mới -> Google và bật nó lên.",
        );
      } else if (
        err.code === "auth/unauthorized-domain" ||
        (err.message && err.message.includes("auth/unauthorized-domain"))
      ) {
        const domain = window.location.hostname;
        setError(
          `Tên miền "${domain}" chưa được cấp quyền trong Firebase. Vui lòng thêm tên miền này vào danh sách "Authorized domains" trong Firebase Console (Authentication -> Settings -> Authorized domains).`,
        );
      } else if (
        err.message === "Tài khoản của bạn không có quyền truy cập hệ thống."
      ) {
        setError(err.message);
      } else {
        setError("Có lỗi xảy ra khi đăng nhập: " + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
            <LogIn className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">
            Đăng nhập hệ thống
          </h2>
          <p className="text-slate-500 text-center mt-2">
            Sử dụng tài khoản Google đã được cấp quyền để truy cập
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 text-rose-600 rounded-xl text-sm font-medium border border-rose-100 text-center">
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3 px-4 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-70 flex justify-center items-center gap-3 shadow-sm"
        >
          {loading ? (
            <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
              Đăng nhập với Google
            </>
          )}
        </button>
      </div>
    </div>
  );
}
