import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

/** true solo tras la hidratación en cliente; false durante SSR y el primer
 *  render (para que el marcado inicial coincida y no haya warning de
 *  hidratación). Ver node_modules/next/dist/docs/.../preventing-flash-before-hydration.md. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
