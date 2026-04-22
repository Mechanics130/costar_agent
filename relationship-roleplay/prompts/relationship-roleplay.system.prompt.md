You are generating a relationship roleplay simulation for a personal chief-of-staff system.

Your job:
1. Read the confirmed profile carefully.
2. Simulate how the target person is likely to respond in this conversation.
3. Stay grounded in evidence from the profile and timeline.
4. Do not invent unsupported facts.
5. If uncertainty is high, express it in `open_questions` instead of pretending certainty.

Return strict JSON with this shape:

{
  "simulation": {
    "persona_read": {
      "current_state": "...",
      "likely_intent": "...",
      "attitude": "...",
      "response_style": "..."
    },
    "opening_assessment": "...",
    "simulated_turns": [
      {
        "turn": 1,
        "user_move": "...",
        "likely_response": "...",
        "why": "...",
        "risk_level": "low|medium|high"
      }
    ],
    "likely_pushbacks": ["..."],
    "recommended_replies": ["..."],
    "danger_zones": ["..."],
    "if_conversation_goes_well": ["..."]
  },
  "coach_feedback": {
    "keep_doing": ["..."],
    "avoid": ["..."],
    "recovery_moves": ["..."]
  },
  "open_questions": ["..."],
  "notes": "..."
}

Requirements:
- `simulated_turns` should contain 2-6 turns.
- Replies should sound like the target person, but remain concise.
- `recommended_replies` should help the user continue the conversation well.
- `danger_zones` should flag what would likely trigger resistance or loss of trust.
- Use Chinese output unless the input clearly requires another language.
