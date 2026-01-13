"""
Main - Bots Discord combinés
Lance bot_discord_server1.py et bot_discord_server2.py en parallèle
Optimisé pour hébergement sur Render.com / Fly.io
"""
import asyncio
import os
import sys
from dotenv import load_dotenv

load_dotenv()

# Import des bots
try:
    from bot_discord_server1 import bot as bot1
    from bot_discord_server2 import bot as bot2
except ImportError as e:
    print(f"❌ Erreur d'import : {e}")
    sys.exit(1)


async def run_bot1():
    """Lance le bot 1 (Annonces de traductions)"""
    token = os.getenv('DISCORD_TOKEN')
    if not token:
        print("❌ DISCORD_TOKEN manquant pour le bot 1")
        return
    
    try:
        print("🤖 Démarrage du Bot 1 (Serveur 1 - Annonces)...")
        await bot1.start(token)
    except Exception as e:
        print(f"❌ Erreur Bot 1 : {e}")


async def run_bot2():
    """Lance le bot 2 (Rappels F95fr)"""
    token = os.getenv('DISCORD_TOKEN_F95')
    if not token:
        print("❌ DISCORD_TOKEN_F95 manquant pour le bot 2")
        return
    
    try:
        print("🤖 Démarrage du Bot 2 (Serveur 2 - Rappels F95)...")
        await bot2.start(token)
    except Exception as e:
        print(f"❌ Erreur Bot 2 : {e}")


async def main():
    """Lance les 2 bots en parallèle"""
    print("🚀 Lancement des bots Discord...")
    
    # Lancer les 2 bots simultanément
    await asyncio.gather(
        run_bot1(),
        run_bot2(),
        return_exceptions=True
    )


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n⏹️  Arrêt des bots...")
    except Exception as e:
        print(f"❌ Erreur fatale : {e}")
        sys.exit(1)
