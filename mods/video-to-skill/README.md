# video-to-skill

`/video-to-skill <link>` turns a video into a Claude Code skill.

1. **Downloads** the video (any site yt-dlp supports, up to 720p), or takes a local file.
2. **Grabs frames**: scene changes first, evenly spaced if the picture barely changes.
3. **Transcribes** the audio with faster-whisper (language is detected, so Hebrew works).
4. **Saves a skill** to `./.claude/skills/<name>/`:

```
<name>/
  SKILL.md        frontmatter, outline, and a table linking each frame to the speech around it
  transcript.md   full timestamped transcript
  frames/         frame-01-00m12s.jpg, ...
```

When the files are written, the model is asked to finish the job: open the key frames, write a real
`description`, and turn the outline into the steps and facts the video teaches. The skill works
before that step, it just gets better after it.

## Install

```
/plugin install video-to-skill --marketplace itailod777-crypto/irregular-verbs
```

You also need `ffmpeg` on your PATH and Python 3 with:

```
pip install yt-dlp faster-whisper
```

The first run downloads the speech model (a few hundred MB for the default `small`) from huggingface.co.

## Usage

```
/video-to-skill https://youtu.be/...
/video-to-skill https://youtu.be/... --name git-rebase --global
/video-to-skill ./demo.mp4 --frames 24 --model medium --language he
```

| Option | Meaning |
|---|---|
| `--name NAME` | Skill name. Default: the video title, lower-cased with hyphens. |
| `--global` | Save to `~/.claude/skills` instead of `./.claude/skills`. |
| `--frames N` | Most frames to keep. Default 16. |
| `--model SIZE` | `tiny`, `base`, `small` (default), `medium`, `large-v3`. Bigger is slower and more accurate. |
| `--language CODE` | Spoken language, such as `en` or `he`. Default: detect. |
| `--no-transcribe` | Frames only. |
| `--keep-video` | Copy the video into the skill folder too. |
| `--force` | Replace a skill with the same name. |

The work runs in the background; progress shows in the status line.

## A note on trust

A transcript is whatever the speaker said, and a video title is whatever the uploader typed. Both are
untrusted. The generated `description`, which Claude loads in every session, is built from the title
and uploader only, never from the speech. `SKILL.md` tells the model to treat the transcript and frames
as reference material and not to follow instructions found in them, and so does the finishing prompt.

You can also run the script directly: `python3 scripts/video_to_skill.py <link> [options]`.
