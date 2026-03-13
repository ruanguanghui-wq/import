import React from "react";
import { Database, Key, AlertCircle } from "lucide-react";

export function FirebaseSetup() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
        <div className="bg-emerald-500 p-6 text-white flex items-center gap-4">
          <div className="p-3 bg-white/20 rounded-xl">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Firebase Setup Required</h1>
            <p className="text-emerald-50 mt-1">
              Configure your environment variables to continue
            </p>
          </div>
        </div>

        <div className="p-8">
          <div className="flex items-start gap-4 mb-8 bg-amber-50 p-4 rounded-xl border border-amber-200">
            <AlertCircle className="w-6 h-6 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-900">
                Missing Configuration
              </h3>
              <p className="text-amber-700 text-sm mt-1">
                The application cannot connect to Firebase because some
                configuration variables are missing. Please set up your Firebase
                project and add ALL the credentials to your environment
                variables.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                  1
                </span>
                Create a Firebase Project
              </h3>
              <p className="text-slate-600 text-sm ml-8">
                Go to the{" "}
                <a
                  href="https://console.firebase.google.com/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-600 hover:underline"
                >
                  Firebase Console
                </a>
                , create a new project, and add a Web App to get your
                configuration.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                  2
                </span>
                Enable Services
              </h3>
              <ul className="text-slate-600 text-sm ml-8 list-disc pl-4 space-y-1">
                <li>
                  Enable <strong>Authentication</strong> (Email/Password
                  provider)
                </li>
                <li>
                  Enable <strong>Firestore Database</strong> (Start in test mode
                  or set up rules)
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-slate-900 flex items-center gap-2 mb-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                  3
                </span>
                Set Environment Variables
              </h3>
              <p className="text-slate-600 text-sm ml-8 mb-3">
                Add the following variables to your environment configuration in
                AI Studio:
              </p>
              <div className="ml-8 bg-slate-900 rounded-xl p-4 overflow-x-auto">
                <pre className="text-slate-300 text-sm font-mono">
                  <span className="text-emerald-400">
                    VITE_FIREBASE_API_KEY
                  </span>
                  ="your-api-key"
                  <br />
                  <span className="text-emerald-400">
                    VITE_FIREBASE_AUTH_DOMAIN
                  </span>
                  ="your-project.firebaseapp.com"
                  <br />
                  <span className="text-emerald-400">
                    VITE_FIREBASE_PROJECT_ID
                  </span>
                  ="your-project-id"
                  <br />
                  <span className="text-emerald-400">
                    VITE_FIREBASE_STORAGE_BUCKET
                  </span>
                  ="your-project.appspot.com"
                  <br />
                  <span className="text-emerald-400">
                    VITE_FIREBASE_MESSAGING_SENDER_ID
                  </span>
                  ="your-sender-id"
                  <br />
                  <span className="text-emerald-400">VITE_FIREBASE_APP_ID</span>
                  ="your-app-id"
                </pre>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-xl transition-colors flex items-center gap-2"
            >
              <Key className="w-4 h-4" />
              I've added the variables, reload
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
