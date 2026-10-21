let dirty = false;

export function setUnsaved(value: boolean) {
  dirty = value;
}

export function confirmLeave() {
  if (!dirty) return true;
  return window.confirm("저장하지 않은 내용이 있습니다. 이동하면 입력 중인 내용이 사라질 수 있습니다. 방문 기록은 초안으로 남아 있을 수 있습니다.");
}
