# Hébergement ZELQANE sur Cloudflare (gratuit)

Principe : comme tukai, le DNS de `zelqane.com` est géré par Cloudflare. Le site tourne sur ce PC
et Cloudflare Tunnel le publie en HTTPS, sans ouvrir de port sur la box. Seul le frontend Next.js
(port 3000) est exposé : le backend (8080) et PostgreSQL (5432) restent accessibles depuis le PC
uniquement, via le pont `/api` du frontend.

> Le site n'est en ligne que lorsque le PC est allumé et que `start-local.ps1 -Public` tourne.

## 1. Domaine : OVH -> Cloudflare (une seule fois)

1. Cloudflare (compte Tukai@tukhnanutha.com) : **Add a domain** -> `zelqane.com` -> plan **Free**.
2. Cloudflare affiche deux serveurs de noms (`xxx.ns.cloudflare.com`).
3. OVH -> Web Cloud -> Noms de domaine -> `zelqane.com` -> **Serveurs DNS** -> Modifier ->
   remplacer `dns111.ovh.net` / `ns111.ovh.net` par les deux serveurs Cloudflare.
4. Attendre que Cloudflare passe le domaine en **Active** (quelques minutes à quelques heures).

## 2. Tunnel (une seule fois)

```powershell
cloudflared tunnel login                  # navigateur : choisir zelqane.com
cloudflared tunnel create zelqane         # affiche le TUNNEL_ID et crée %USERPROFILE%\.cloudflared\<id>.json
cloudflared tunnel route dns zelqane zelqane.com
cloudflared tunnel route dns zelqane www.zelqane.com
```

Copier `deploy/cloudflare/zelqane.yml.example` vers `%USERPROFILE%\.cloudflared\zelqane.yml`
et y remplacer `<TUNNEL_ID>`.

## 3. Lancer / arrêter

```powershell
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Public   # https://zelqane.com
powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Stop
```

`-Public` démarre le backend sans le profil `local` (pas d'heure simulée), reconstruit le frontend
avec `SITE_URL=https://zelqane.com` si besoin, puis lance le tunnel (journal : `cloudflared.log`).

## Évolution

Pour un site disponible 24 h/24 sans le PC : Cloudflare Containers (offre Workers Paid, 5 $/mois)
ou un petit VPS, avec le même tunnel.
