import React, { useState, useEffect } from 'react';

interface BotStatus {
  name: string;
  url: string;
  status: 'checking' | 'connected' | 'disconnected';
  bot_name?: string;
}

interface BotMonitorProps {
  onRestartBot?: (botName: string) => void;
}

export default function BotMonitor({ onRestartBot }: BotMonitorProps) {
  const [bots, setBots] = useState<BotStatus[]>([
    { name: 'Bot Serveur 1', url: 'http://127.0.0.1:5001/status', status: 'checking' },
    { name: 'Bot Serveur 2 (F95)', url: 'http://127.0.0.1:5002/status', status: 'checking' },
    { name: 'Publisher API', url: 'http://127.0.0.1:8081/status', status: 'checking' }
  ]);

  const checkBotStatus = async (bot: BotStatus): Promise<BotStatus> => {
    try {
      const response = await fetch(bot.url);
      if (response.ok) {
        const data = await response.json();
        return {
          ...bot,
          status: (data.discord_connected || data.publisher_connected) ? 'connected' : 'disconnected',
          bot_name: data.bot_name
        };
      }
      return { ...bot, status: 'disconnected' };
    } catch {
      return { ...bot, status: 'disconnected' };
    }
  };

  const checkAllBots = async () => {
    const updatedBots = await Promise.all(bots.map(checkBotStatus));
    setBots(updatedBots);
  };

  useEffect(() => {
    checkAllBots();
    const interval = setInterval(checkAllBots, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRestart = async (botName: string) => {
    if (onRestartBot) {
      await onRestartBot(botName);
      setTimeout(() => checkAllBots(), 2000);
    }
  };

  const getStatusBadge = (status: BotStatus['status']) => {
    const styles = {
      checking: { bg: '#6c757d', text: '⏳ Vérification...' },
      connected: { bg: '#28a745', text: '✓ Connecté' },
      disconnected: { bg: '#dc3545', text: '✗ Déconnecté' }
    };
    const style = styles[status];
    
    return (
      <span style={{
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 12,
        background: style.bg,
        color: 'white',
        fontWeight: 600
      }}>
        {style.text}
      </span>
    );
  };

  return (
    <div style={{
      padding: 16,
      background: 'var(--bg-secondary)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      marginBottom: 16
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12
      }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>
          🤖 État des Bots Discord
        </h3>
        <button
          onClick={checkAllBots}
          style={{
            padding: '4px 12px',
            fontSize: 11,
            background: 'var(--info)',
            color: 'white',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          🔄 Rafraîchir
        </button>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {bots.map((bot, idx) => (
          <div
            key={idx}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: 8,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 4
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 12 }}>{bot.name}</div>
              {bot.bot_name && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  {bot.bot_name}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {getStatusBadge(bot.status)}
              {bot.status === 'disconnected' && (
                <button
                  onClick={() => handleRestart(bot.name)}
                  style={{
                    padding: '4px 8px',
                    fontSize: 10,
                    background: 'var(--warning)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                  title="Redémarrer ce bot"
                >
                  ♻️
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 12,
        padding: 8,
        background: 'rgba(255, 193, 7, 0.1)',
        border: '1px solid rgba(255, 193, 7, 0.3)',
        borderRadius: 4,
        fontSize: 10,
        color: 'var(--muted)'
      }}>
        💡 Les bots démarrent automatiquement au lancement de l'application.
        Mise à jour automatique toutes les 5 secondes.
      </div>
    </div>
  );
}