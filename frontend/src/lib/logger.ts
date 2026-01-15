/**
 * Logger centralisé pour l'application
 * Écrit les logs dans un fichier unique par session
 */

import { tauriAPI } from './tauri-api';

class Logger {
  private static instance: Logger;
  private logFileName: string = '';
  private isEnabled: boolean = false;

  private constructor() {
    // Vérifier si le mode debug est activé
    try {
      this.isEnabled = localStorage.getItem('debugMode') === 'true';
    } catch {
      this.isEnabled = false;
    }

    // Générer le nom de fichier avec timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    this.logFileName = `error-log-${timestamp}.log`;

    // Écrire le header du log
    if (this.isEnabled) {
      this.write(`
========================================
Session de debug démarrée
Date: ${new Date().toLocaleString('fr-FR')}
========================================
`);
    }
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  getLogFileName(): string {
    return this.logFileName;
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (enabled) {
      this.write('🔧 Mode debug activé');
    }
  }

  private async write(message: string) {
    if (!this.isEnabled || !this.logFileName) return;
    
    try {
      await tauriAPI.appendToLog(this.logFileName, message + '\n');
    } catch (error) {
      console.error('Erreur lors de l\'écriture du log:', error);
    }
  }

  async log(message: string, data?: any) {
    if (!this.isEnabled) return;
    
    const timestamp = new Date().toISOString();
    let logEntry = `[${timestamp}] ${message}`;
    
    if (data) {
      logEntry += `\n${JSON.stringify(data, null, 2)}`;
    }
    
    await this.write(logEntry);
  }

  async info(message: string, data?: any) {
    await this.log(`ℹ️ ${message}`, data);
  }

  async success(message: string, data?: any) {
    await this.log(`✅ ${message}`, data);
  }

  async warning(message: string, data?: any) {
    await this.log(`⚠️ ${message}`, data);
  }

  async error(message: string, error?: any) {
    let errorData = error;
    if (error instanceof Error) {
      errorData = {
        message: error.message,
        stack: error.stack,
        name: error.name
      };
    }
    await this.log(`❌ ${message}`, errorData);
  }

  async publish(action: string, details: any) {
    await this.log(`📤 PUBLICATION: ${action}`, details);
  }

  async api(method: string, url: string, data?: any, response?: any) {
    const logData: any = {
      method,
      url,
      timestamp: new Date().toISOString()
    };
    
    if (data) {
      logData.requestData = data;
    }
    
    if (response) {
      logData.response = response;
    }
    
    await this.log(`🌐 API Call: ${method} ${url}`, logData);
  }
}

// Export de l'instance singleton
export const logger = Logger.getInstance();
