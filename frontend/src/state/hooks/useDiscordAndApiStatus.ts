import { useEffect, useState } from 'react';

/** État global Discord (config) et statut API (badge). */
export function useDiscordAndApiStatus() {
  const [discordConfig, setDiscordConfig] = useState<Record<string, unknown>>(() => {
    try {
      const raw = localStorage.getItem('discordConfig');
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return {};
  });

  const [apiStatus, setApiStatus] = useState<string>('unknown');

  useEffect(() => {
    try {
      localStorage.setItem('discordConfig', JSON.stringify(discordConfig));
    } catch {
      /* ignore */
    }
  }, [discordConfig]);

  return { discordConfig, setDiscordConfig, apiStatus, setApiStatus };
}
