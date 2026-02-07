# Tiny Civs

## Overview
**Tiny Civs** is a web-based AI-driven simulation game where a small population of autonomous entities—called **Civlings**—evolves over time. Each Civling makes independent decisions, discovers technologies, builds structures, reproduces, and may eventually perish. The simulation observes how civilizations emerge, collapse, and restart across multiple evolutionary cycles.

The project starts intentionally small and simple, designed to evolve incrementally.

---

## Core Concepts

### Civlings (Entities)
- **Name:** Civling (singular) / Civlings (plural)
- **Pronunciation:** *SIV-lingz*
- Autonomous AI-driven beings
- Each Civling has its own internal state, memory, and decision-making logic
- Civlings collectively form a civilization

### Civilization Lifecycle
- Civilization begins with a small population (e.g. 3–6 Civlings)
- Civlings act independently but affect shared resources and progress
- Civilizations may:
  - Thrive and advance through eras
  - Collapse due to extinction
- Each extinction triggers a **restart**, which is tracked and analyzed

---

## Evolution & Progression

- Civlings start in a primitive state
- Evolution occurs through discoveries and milestones, such as:
  - Fire
  - Tools
  - Shelter
  - Agriculture
  - Research & knowledge sharing
- Progress unlocks new behaviors, prompt types, and possible actions
- Knowledge may be inherited, lost, or rediscovered across generations

---

## AI & Decision Making

### Primary AI Approach (Initial Phase)
- **Codex CLI / OpenAI models** are used for decision-making
- Each Civling sends structured prompts describing its context
- The LLM returns a decision, reasoning, or action proposal

### Prompt Strategy
- Prompts are **dynamic**, not shared blindly
- Prompt content varies based on:
  - Civling role
  - Current needs (food, shelter, curiosity)
  - Era / technology level
  - Environmental conditions

### Example Prompt (Conceptual)
> You are a Civling in a primitive civilization. Food is scarce, and no shelter exists. Choose one action: gather food, build shelter, explore. Explain briefly.

---

## Optional: Local LLM Support

- Local LLMs (e.g. small Qwen models) may be added as an optional path
- Used for:
  - Offline mode
  - Cost or latency reduction
  - Comparative testing vs cloud models
- Decision logic remains compatible across both approaches

---

## Environment & Visualization

- **2D web-based environment**
- Technologies:
  - HTML5 Canvas
  - PixiJS or Phaser (optional)
- Visuals start minimal:
  - Simple shapes or icons
  - No designer required
- Focus is clarity over aesthetics in early stages

---

## Data & Persistence

### Early Phase
- In-memory state management
- Periodic snapshots stored as JSON

### Tracked Data
- Civilization run ID
- Number of restarts
- Duration of each civilization
- Milestones reached
- Cause of extinction

---

## Core Simulation Loop

1. Civilization tick
2. Each Civling evaluates its context
3. Prompt sent to AI (Codex CLI or local LLM)
4. Action selected
5. World state updated
6. Evolution / death checks
7. Persist state
8. Repeat

---

## Testing & Experimentation

- Compare responses between:
  - Codex / OpenAI models
  - Local LLMs
- Measure:
  - Quality of decisions
  - Consistency
  - Performance

---

## Long-Term Vision (Optional)

- Multiple civilizations
- Advanced eras
- Player intervention tools
- Visualization timelines
- Exportable civilization history

---

## Status

**Phase:** Concept & Planning
**Next Step:** Define Civling data model and base prompt template

