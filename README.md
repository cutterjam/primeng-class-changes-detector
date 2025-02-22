# PrimeNG Class Changes Detector

Detects and analyzes class name changes in PrimeNG repository (v17->19).

## Setup

```bash
npm install
```

Add OpenAI API key to `.env`:
```
OPENAI_API_KEY=your_key_here
```

## Usage

Run with AI analysis:
```bash
npm run track-ai
```

Run without AI:
```bash
npm run track
```

### Options

- `--output-dir, -o`: Output directory for logs
- `--class-names, -c`: List of class names to search
- `--use-ai, -a`: Enable AI analysis

Results are written to `./class-changes-results/` by default.
