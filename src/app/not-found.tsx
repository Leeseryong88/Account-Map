import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="grid justify-items-center gap-3">
        <p className="text-5xl font-bold text-[#cbd2dc]">404</p>
        <h1 className="text-xl font-bold">페이지를 찾을 수 없습니다</h1>
        <Link href="/map" className="btn btn-primary mt-2">거래처 지도로 가기</Link>
      </div>
    </main>
  );
}
