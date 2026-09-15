# Public repository checklist

Target owner: `MooradXO`.

## Ready

- The obsolete Git remote is detached; the old repository must not be reused.
- Supabase configuration is read only from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `.env.example` contains placeholders only; local `.env*` files are ignored.
- Source scan contains no JWT-like values.
- Temporary build, Vite and TypeScript output files are outside the project tree.
- Root smoke screenshots are ignored; retained evidence lives under `docs/phases_archive/`.
- Production build and browser guest smoke pass.
- Code is split into app, Three.js, Supabase, animation, physics and voice-chat chunks.
- Planet assets include their own CC0 license notes and are not relicensed by the code license.
- Source code is licensed under MIT with `MooradXO` as the copyright holder.
- Paid-plan Meshy ship/station GLB output is owned by MooradXO and documented separately under CC BY 4.0 with attribution.
- Local procedural ambient is the default; an external stream can be enabled only through `VITE_AMBIENT_STREAM_URL` when embedding permission exists.

## Publication

- Canonical repository: `https://github.com/MooradXO/universe-explorer`.
- Publish the current project as a clean root snapshot without the old `Inaklarnet` repository history.
- Run the final secret scan, production build and dependency audit before the first push.
- After cloning on another computer, create a local `.env` from `.env.example` to enable Supabase multiplayer; guest mode works without it.

## External radio decision

The public-safe build uses local procedural ambient. The stream integration remains available as a generic opt-in environment setting; SomaFM can be configured later after written permission is received.
