"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid justify-items-center gap-3">
        <h1 className="text-xl font-bold">화면을 표시하지 못했습니다</h1>
        <p className="text-sm text-subtle">잠시 후 다시 시도해 주세요.</p>
        <button type="button" className="btn btn-primary mt-2" onClick={reset}>다시 시도</button>
      </div>
    </main>
  );
}
