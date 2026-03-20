import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";

/**
 * Fetches an image URL that requires Bearer authentication and returns a
 * stable object URL suitable for use in <img src>, or undefined while loading.
 * The object URL is revoked automatically when the component unmounts or the
 * source URL changes.
 */
export function useAuthenticatedImage(url: string | undefined): string | undefined {
  const [objectUrl, setObjectUrl] = useState<string | undefined>(undefined);
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!url || !accessToken) {
      setObjectUrl(undefined);
      return;
    }

    let revoked = false;
    let currentObjectUrl: string | undefined;

    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (revoked) return;
        const blobUrl = URL.createObjectURL(blob);
        currentObjectUrl = blobUrl;
        setObjectUrl(blobUrl);
      })
      .catch(() => {
        if (!revoked) setObjectUrl(undefined);
      });

    return () => {
      revoked = true;
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl);
      setObjectUrl(undefined);
    };
  }, [url, accessToken]);

  return objectUrl;
}
