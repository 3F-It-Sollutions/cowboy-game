# Dead Man's Draw 🤠

Cowboy top-down shooter. Survive 7 waves of outlaws!

## Deploy in 3 comenzi:

```bash
npm install
npx vercel
```

Prima dată o să te întrebe câteva chestii - dă Enter la toate (defaults). 
La final primești URL-ul live.

### Sau cu Netlify:

```bash
npm install
npm run build
npx netlify deploy --prod --dir=dist
```

### Sau manual:
1. Mergi pe https://app.netlify.com/drop
2. Rulează `npm install && npm run build`
3. Drag & drop folderul `dist/` pe pagină
4. Gata, ai link!

## Dev local:

```bash
npm install
npm run dev
```

Se deschide pe http://localhost:5173

## Controale:
- **WASD / Arrows** — Mișcare
- **Mouse** — Aim & Shoot
- **SPACE** — Dodge Roll
- **Touch** — Stânga=Move, Dreapta=Shoot
