import { useEffect } from "react";
import { useStore } from "@/lib/store";

/** Client-side route protection: blocks rendering and opens the login modal with a warning badge. */
export function useRequireAuth(area: string) {
  const { isAuthed, openAuth } = useStore();

  useEffect(() => {
    if (!isAuthed) {
      openAuth("login", `Protected area: you must be logged in to access the ${area}.`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, area]);

  return isAuthed;
}
