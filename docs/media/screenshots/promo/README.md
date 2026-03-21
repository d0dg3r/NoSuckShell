# Promo video assets

Short **MP4** or **WebM** screen recordings can live here (e.g. `nosuckshell-demo.mp4`) for release uploads or README links.

We do **not** commit large binary videos by default. Record locally using the checklist in [../VIDEO.md](../VIDEO.md).

### Minimal silent clip (placeholder / tests)

```bash
ffmpeg -f lavfi -i color=c=black:s=1920x1080:d=3 -pix_fmt yuv420p nosuckshell-placeholder.mp4
```

Replace with a real screen capture before publishing.
