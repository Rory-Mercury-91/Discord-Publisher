/**
 * API Tauri
 * Wrapper pour les commandes Tauri backend
 */

import { invoke } from '@tauri-apps/api/core';

// Types de retour - Exportés pour utilisation dans les composants
export interface PublishPostData {
  thread_id?: string;
  message_id?: string;
  thread_url?: string;
  url?: string;
  forum_id?: number;
}

export interface PublishPostResponse {
  ok: boolean;
  data?: PublishPostData;
  error?: string;
  status?: number;
  rateLimit?: {
    remaining: number;
    limit: number;
  };
}

export interface ConfigData {
  customTemplates?: any[];
  savedTags?: any[];
  savedInstructions?: any[];
  customVariables?: any;
}

export interface TemplateData {
  id?: string;
  name: string;
  type?: string;
  content: string;
}

export interface ExportResponse {
  ok: boolean;
  canceled?: boolean;
  error?: string;
}

export interface ImportResponse {
  ok: boolean;
  config?: ConfigData;
  canceled?: boolean;
  error?: string;
}

export interface ImportTemplateResponse {
  ok: boolean;
  config?: TemplateData;
  canceled?: boolean;
  error?: string;
}

export const tauriAPI = {
  /**
   * Publier un post sur Discord
   */

  async publishPost(payload: any): Promise<PublishPostResponse> {
    try {
      const apiUrl = localStorage.getItem('apiUrl') || '';
      const apiKey = localStorage.getItem('apiKey') || '';
      const response = await fetch(`${apiUrl}/api/forum-post`, {
        method: 'POST',
        headers: {
          'X-API-KEY': apiKey
        },
        body: payload
      });
      if (response.ok) {
        const result = await response.json();
        return { ok: true, data: result as PublishPostData };
      } else {
        return { ok: false, error: 'Erreur API', status: response.status };
      }
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Tester la connexion à l'API locale
   */
  async testConnection() {
    try {
      const result = await invoke('test_api_connection');
      return { ok: true, data: result };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Sauvegarder une image dans le dossier images/
   */
  async saveImage(filePath: string) {
    try {
      const fileName = await invoke<string>('save_image', { sourcePath: filePath });
      return { ok: true, fileName };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },


  /**
   * Sauvegarder une image depuis base64 (pour drag & drop uniquement)
   */
  async saveImageFromBase64(base64Data: string, fileName: string, mimeType: string) {
    try {
      const savedFileName = await invoke<string>('save_image_from_base64', {
        base64Data,
        fileName,
        mimeType
      });
      return { ok: true, fileName: savedFileName };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Lire une image en base64
   */
  async readImage(imagePath: string) {
    try {
      const base64 = await invoke<string>('read_image', { imagePath });
      // Convert base64 data URL to buffer format expected by frontend
      const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return { ok: true, buffer: Array.from(bytes) };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Supprimer une image
   */
  async deleteImage(imagePath: string) {
    try {
      await invoke('delete_image', { imagePath });
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Obtenir la taille d'une image
   */
  async getImageSize(imagePath: string) {
    try {
      const size = await invoke<number>('get_image_size', { imagePath });
      return { ok: true, size };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Lister toutes les images
   */
  async listImages() {
    try {
      const files = await invoke<string[]>('list_images');
      return { ok: true, files };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Exporter la configuration complète
   */
  async exportConfigToFile(config: any): Promise<ExportResponse> {
    try {
      const jsonString = JSON.stringify(config, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bot-discord-config-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Importer la configuration complète
   */
  async importConfigFromFile(): Promise<ImportResponse> {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      return new Promise((resolve) => {
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) {
            resolve({ ok: false, canceled: true });
            return;
          }
          
          try {
            const content = await file.text();
            const config = JSON.parse(content);
            resolve({ ok: true, config });
          } catch (error: any) {
            resolve({ ok: false, error: error.message || String(error) });
          }
        };
        input.click();
      });
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Exporter un template
   */
  async exportTemplateToFile(template: any): Promise<ExportResponse> {
    try {
      const jsonString = JSON.stringify(template, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `template-${template.name || 'export'}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Importer un template
   */
  async importTemplateFromFile(): Promise<ImportTemplateResponse> {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      
      return new Promise((resolve) => {
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) {
            resolve({ ok: false, canceled: true });
            return;
          }
          
          try {
            const content = await file.text();
            const template = JSON.parse(content);
            resolve({ ok: true, config: template });
          } catch (error: any) {
            resolve({ ok: false, error: error.message || String(error) });
          }
        };
        input.click();
      });
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Écrire dans le presse-papiers (natif au navigateur)
   */
  async writeClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Ajouter du contenu au fichier de log
   */
  async appendToLog(fileName: string, content: string) {
    try {
      await invoke('append_to_log', { fileName, content });
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Ouvrir le fichier de log avec l'éditeur par défaut
   */
  async openLogFile(fileName: string) {
    try {
      await invoke('open_log_file', { fileName });
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Écrit la configuration bots dans un fichier .env utilisable par Python
   */
  async writeEnvFile(envContent: string) {
    try {
      await invoke('write_env_file', { envContent });
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Redémarre les bots Python (kill + relance)
   */
  async restartPythonBots() {
    try {
      await invoke('restart_python_bots');
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Lire le contenu d'un fichier log (tauri_debug.log ou errors.log)
   */
  async readLogFile(fileName: string): Promise<string> {
    try {
      const content = await invoke<string>('read_log_file', { fileName });
      return content;
    } catch (error: any) {
      throw new Error(error.message || String(error));
    }
  },

  /**
   * Obtenir l'état des processus Python
   */
  async getBotsStatus() {
    try {
      const result = await invoke('get_bots_status');
      return { ok: true, data: result };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Ouvrir une URL dans le navigateur externe
   */
  async openUrl(url: string) {
    try {
      await invoke('open_url', { url });
      return { ok: true };
    } catch (error: any) {
      return { ok: false, error: error.message || String(error) };
    }
  },

  /**
   * Historique local : sauvegarde un post (tous les champs) dans le dossier de l'app, par utilisateur.
   * Dossier : app_data_dir / history / {author_discord_id ou "default"} / posts.json
   * À appeler après publication ou mise à jour (row = format Supabase snake_case).
   */
  async saveLocalHistoryPost(row: Record<string, unknown>, authorDiscordId: string | null | undefined) {
    try {
      await invoke('save_local_history_post', {
        postJson: JSON.stringify(row),
        authorDiscordId: authorDiscordId ?? null
      });
      return { ok: true };
    } catch (_e) {
      return { ok: false };
    }
  },

  /** Indique si l'utilisateur a un fichier d'archive d'historique local (afficher la checkbox). */
  async hasLocalHistoryArchive(authorDiscordId: string | null | undefined): Promise<boolean> {
    try {
      return await invoke<boolean>('has_local_history_archive', {
        authorDiscordId: authorDiscordId ?? null
      });
    } catch (_e) {
      return false;
    }
  },

  /** Charge le contenu de l'archive d'historique local (JSON array de posts). */
  async getLocalHistoryArchive(authorDiscordId: string | null | undefined): Promise<{ ok: boolean; data?: unknown[] }> {
    try {
      const json = await invoke<string>('get_local_history_archive', {
        authorDiscordId: authorDiscordId ?? null
      });
      const data = json ? JSON.parse(json) : [];
      return { ok: true, data: Array.isArray(data) ? data : [] };
    } catch (_e) {
      return { ok: false };
    }
  },
};
