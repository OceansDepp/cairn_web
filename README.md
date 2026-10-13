# CAIRN project page

Source of https://oceansdepp.github.io/cairn_web/ — a static page (no build step).

- `index.html` — page content
- `static/css/cairn.css` — styles
- `static/js/main.js` — hero animation, interactive teaser, attention-mask demo, results charts, scene explorer
- `static/js/scene-viewer.js` — WebGL (three.js) viewer for multi-room point clouds, room boxes and scene graphs
- `static/scenes/<key>.{bin,json}` — six CAIRN-MR validation scenes: points (int16 xyz in mm, uint8 rgb, uint8 room, uint16 object id), rooms, objects and questions with CAIRN / baseline predictions
- `static/images/` — paper figures, scene thumbnails and icons

Preview locally with `python -m http.server` in this directory and open http://localhost:8000 (the 3D viewer needs to be served over HTTP, not opened as a file).
