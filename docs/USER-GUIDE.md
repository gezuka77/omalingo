# Use Oma Lingo

## Start learning

Sign in and choose a study language. You can add languages and switch between them from the language menu or **Settings → Languages**. Lessons, vocabulary and progress are separate for each language. Interests personalize discovery, and the public catalog is shared by learners of that language.

| Area | Use it to |
| --- | --- |
| **Discover** | Browse public sources, courses, videos, podcasts and news |
| **Library** | Resume lessons, organize imported material and manage playlists |
| **O/L Words** | Find, edit, practise and export saved vocabulary |
| **O/L AI** | Ask for translations, explanations and learning help |
| **Settings** | Configure the reader, languages, connections, Anki, backups and accounts |

## Find and import material

1. In **Discover**, choose a category and filter by provider, content type, level or length. A provider may offer individual items, a link to its public material, or both.
2. Preview an item and select **Import**, or open **Create** to paste text, use a URL, or choose a local document or subtitle file. Use individual articles, videos and chapters for short learning sessions.
3. For YouTube, choose a transcript source. Oma Lingo can check for available publisher and automatic captions. You can choose those captions, provide your own subtitles, or ask OpenAI to transcribe original audio when a key is configured. Transcription can incur usage charges.
4. Use **Imports** to follow jobs. A server-side import continues if you close its dialog or browser tab. When it is ready, open the preview, verify the text and save the lesson.

The same source can already be present in your library. Open that lesson from the import notice. In the lesson actions or editor, archive lessons to take them out of active lists or delete lessons you want to remove. Use the archived filter to find archived items.

Common file formats include TXT, HTML, DOCX, EPUB, text-based PDF, SRT and VTT. A scanned PDF needs selectable text before import. Source access, available subtitles and audio downloads depend on the publisher.

## Read and listen

- Use **Sentence view** to work with one sentence at a time and **Page view** to read the passage. **Show Translation** displays an existing translation or requests one from the configured provider.
- Use the bottom player to play, seek, change speed, move between sentences and return to the beginning. Source video or audio plays when available and selected. Generated narration uses the voice in **AI & Connections**.
- Playback highlights the current text when the lesson has timing. The reader follows vertically and leaves some upcoming text in view. Use **Transcript** in the lesson menu to inspect or replace the transcript and **Sentence Audio & Timing** to work with alignment.
- Open **Review Sentence** for sentence exercises or **Review Lesson** to practise the lesson’s vocabulary. Use the reader’s appearance controls or **Settings → Reader** to adjust typography and reading preferences.
- Use the lesson’s playlist action to add it to a playlist. Open **Library → Playlists** to organize and play lessons in sequence.

### Local voices

| Study language | Piper voice |
| --- | --- |
| Finnish | Harri |
| English | Lessac |
| Hungarian | Anna |
| Traditional Chinese | Huayan, Mandarin |
| Japanese | Hi Fi Captain |

Piper downloads the model when a study language is added or the voice is needed. The first download needs internet access. Afterward, the voice runs locally on the server and stays available across container updates.

## Save and practise vocabulary

Select a word in the text to open its meaning panel. You can pronounce the term, edit and save a meaning, open dictionaries, use dictionary definitions or contextual AI suggestions, and save a related phrase. Saved meanings belong to your account and study language. You can choose a familiarity level from 1 to 4, mark the term known, or ignore it.

Use **O/L Words** to search and filter entries, switch between **Cards** and **Table**, practise due words and manage saved terms in bulk. The sentence’s vocabulary tabs let you switch among saved, new and all words in the current sentence.

### Anki

Open **Settings → Anki**. On a central-server installation, your administrator links your personal collection; test the connection and enable each study language. Anki Desktop can stay closed. Your Anki clients use the displayed custom sync server and your personal Anki login. O/L notes, context and practice progress stay in O/L; words and meanings sync through the central collection. Anki clients sync their own review history.

On a desktop-mode installation, connect a reachable Anki Desktop instance with AnkiConnect enabled. Use the connection test and enable sync for your study language. After linking, Anki is authoritative for conflicts on synced vocabulary and manages its own review scheduling. You can pause sync or use the vocabulary export for a file-based transfer.

## Connect AI and speech

Open **Settings → AI & Connections** to configure each service.

| Feature | Options in the app |
| --- | --- |
| Learning assistance, meanings and translation | OpenAI, or local tools such as Ollama and the supported Argos translation pair |
| Generated speech | Local Piper, OpenAI, or ElevenLabs through OpenRouter |
| Transcription | OpenAI for supported original audio imports, or local Whisper for attached audio |

Use API keys for the corresponding providers. Cloud requests can incur charges. Preview the selected generated voice and keep a separate choice for the text model. The current O/L AI conversation is kept for 24 hours after its last message. You can clear it sooner with **Clear chat**.

## Move your library

Open **Settings → Backup & Restore** in each study language to export its library ZIP. Restore it to the matching language on the target account. See [Administration and recovery](ADMIN.md) for full-installation backups, which also cover accounts and connection settings.


### Following audio while reading

The active generated-speech sentence is highlighted, including after using
**Beginning**. Page view keeps the text in place between spoken sentences.
Audio follow scrolls when the active text leaves the reading window; touching or
scrolling the text temporarily pauses automatic following so you can browse freely.
