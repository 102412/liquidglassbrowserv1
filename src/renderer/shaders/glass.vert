// Full-viewport quad. All the interesting work happens in glass.frag using
// gl_FragCoord, so this stage just forwards clip-space positions.
//
// Reference copy — the live copy used at runtime is inlined as a string in
// glass.js, because Chromium refuses fetch() of file:// resources from a
// file:// page (opaque-origin CORS), which would break shader loading in
// the packaged app. Keep the two in sync when editing.
attribute vec2 a_position;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
