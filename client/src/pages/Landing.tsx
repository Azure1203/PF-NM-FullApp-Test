export default function Landing() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6 relative"
      style={{
        background: "radial-gradient(ellipse at center, #4a4540 0%, #2E2E2E 55%, #1a1a1a 100%)",
      }}
    >
      <div className="w-full max-w-[340px] flex flex-col items-center gap-5">

        {/* Netley Millwork Logo Box */}
        <div
          className="rounded-xl shadow-xl px-5 py-4 flex items-center gap-3 bg-white"
          style={{ minWidth: 220 }}
        >
          {/* Stylized N */}
          <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="52" height="52" rx="4" fill="white"/>
            <path
              d="M8 42V10h7.5L33 31.5V10h7.5v32H33L15.5 20.5V42H8z"
              fill="#1a1a1a"
            />
          </svg>

          {/* Wordmark */}
          <div className="flex flex-col leading-none">
            <span
              className="font-black tracking-widest text-base"
              style={{ color: "#1a1a1a", letterSpacing: "0.18em", fontFamily: "var(--font-display)" }}
            >
              NETLEY
            </span>
            <div className="my-1" style={{ height: 2, backgroundColor: "#CDAB4A", width: "100%" }} />
            <span
              className="font-semibold tracking-widest text-xs"
              style={{ color: "#1a1a1a", letterSpacing: "0.22em", fontFamily: "var(--font-display)" }}
            >
              MILLWORK
            </span>
          </div>
        </div>

        {/* Title & subtitle */}
        <div className="text-center space-y-1.5">
          <h1
            className="text-2xl font-bold"
            style={{ color: "#F7F4F2", fontFamily: "var(--font-display)" }}
          >
            Closet Order Processing
          </h1>
          <p className="text-sm" style={{ color: "#9e978f" }}>
            Sign in with your Replit account to continue
          </p>
        </div>

        {/* Login card */}
        <div
          className="w-full rounded-2xl p-6 shadow-2xl space-y-4"
          style={{ backgroundColor: "#F7F4F2" }}
        >
          <p className="text-sm text-center" style={{ color: "#807161" }}>
            Access is restricted to authorized team members. Click below to authenticate.
          </p>

          {/* Sign In button */}
          <a href="/api/login" className="block w-full">
            <button
              data-testid="button-login"
              className="w-full flex items-center justify-center gap-2.5 py-3 rounded-lg font-semibold text-sm tracking-wide transition-all duration-150 hover:opacity-90 active:scale-[.98] shadow-md"
              style={{ backgroundColor: "#CDAB4A", color: "#2E2E2E" }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                <polyline points="10 17 15 12 10 7"/>
                <line x1="15" y1="12" x2="3" y2="12"/>
              </svg>
              Sign In
            </button>
          </a>
        </div>

      </div>

      {/* Footer */}
      <p
        className="absolute bottom-6 text-xs text-center"
        style={{ color: "#807161" }}
      >
        Netley Millwork &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
