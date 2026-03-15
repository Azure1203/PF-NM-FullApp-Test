export default function Landing() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-6"
      style={{ backgroundColor: "#2E2E2E" }}
    >
      {/* Login card */}
      <div
        className="w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: "#F7F4F2" }}
      >
        {/* Gold header bar */}
        <div
          className="h-2 w-full"
          style={{ backgroundColor: "#CDAB4A" }}
        />

        <div className="px-10 py-10 flex flex-col items-center gap-7">
          {/* Monogram */}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center shadow-md flex-shrink-0"
            style={{ backgroundColor: "#CDAB4A" }}
          >
            <span
              className="text-2xl font-bold tracking-tight select-none"
              style={{ color: "#2E2E2E", fontFamily: "var(--font-display)" }}
            >
              NM
            </span>
          </div>

          {/* Title block */}
          <div className="text-center space-y-1.5">
            <p
              className="text-xs font-semibold uppercase tracking-widest"
              style={{ color: "#807161" }}
            >
              Netley Millwork
            </p>
            <h1
              className="text-xl font-bold leading-snug"
              style={{ color: "#2E2E2E", fontFamily: "var(--font-display)" }}
            >
              Closet Order Processing
            </h1>
          </div>

          {/* Divider */}
          <div className="w-full h-px" style={{ backgroundColor: "#807161", opacity: 0.2 }} />

          {/* Sign-in button */}
          <a href="/api/login" className="w-full">
            <button
              data-testid="button-login"
              className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all duration-200 hover:opacity-90 active:scale-95 shadow-md"
              style={{
                backgroundColor: "#CDAB4A",
                color: "#2E2E2E",
              }}
            >
              Sign In
            </button>
          </a>

          <p
            className="text-xs text-center"
            style={{ color: "#807161" }}
          >
            Authorized personnel only
          </p>
        </div>
      </div>

      {/* Footer */}
      <p
        className="mt-8 text-xs text-center"
        style={{ color: "#807161", opacity: 0.7 }}
      >
        &copy; {new Date().getFullYear()} Netley Millwork
      </p>
    </div>
  );
}
