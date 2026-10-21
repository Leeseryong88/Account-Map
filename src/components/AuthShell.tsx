import { BellRing, FileText, MapPinned } from "lucide-react";

const POINTS = [
  { icon: MapPinned, text: "거래처를 지도에서 한눈에" },
  { icon: FileText, text: "기본 템플릿으로 바로 방문 기록" },
  { icon: BellRing, text: "다음 연락일은 알림으로" },
];

export function AuthShell({ title, description, children, footer }: { title: string; description: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_minmax(480px,1fr)]">
      <section className="relative hidden overflow-hidden bg-[#1f3fa8] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute -right-24 -top-24 size-96 rounded-full bg-white/10" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-16 size-80 rounded-full bg-white/5" aria-hidden="true" />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-xl bg-white text-primary"><MapPinned className="size-5" aria-hidden="true" /></span>
          <span className="text-xl font-bold">거래처 관리 지도</span>
        </div>
        <div className="relative grid gap-6">
          <p className="text-[34px] font-bold leading-tight">어디를 언제 다녀왔는지,<br />지도 한 장으로 정리하세요.</p>
          <ul className="grid gap-3">
            {POINTS.map((point) => {
              const Icon = point.icon;
              return (
                <li key={point.text} className="flex items-center gap-3 text-lg text-white/90">
                  <span className="grid size-9 place-items-center rounded-lg bg-white/15"><Icon className="size-[18px]" aria-hidden="true" /></span>
                  {point.text}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-sm text-white/60">개인 계정의 데이터는 본인만 볼 수 있습니다.</p>
      </section>
      <section className="flex flex-col justify-center px-5 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-primary text-white"><MapPinned className="size-5" aria-hidden="true" /></span>
            <span className="text-xl font-bold">거래처 관리 지도</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1.5 text-sm text-subtle">{description}</p>
          <div className="mt-7">{children}</div>
          <div className="mt-6 text-center text-sm text-subtle">{footer}</div>
        </div>
      </section>
    </main>
  );
}
