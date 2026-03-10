# SKILL: Web Search
**Category ID:** `WEB_SEARCH`  
**Tool Used:** `web_search`

---

## Purpose
Search the web for current information and return a clean, structured summary to the user.

---

## WHEN TO USE WEB SEARCH

Use `web_search` when the user asks for:
- Current news or events
- Prices (stocks, products, crypto)
- Weather (supplement with search result)
- Definitions or explanations of topics
- How-to guides or tutorials
- Comparisons ("best X for Y")
- Anything that requires up-to-date information

Do NOT use web search for:
- File/system operations (use `execute_terminal_command`)
- Tasks the AI can answer from training knowledge
- Calculations or code generation

---

## QUERY CONSTRUCTION RULES

1. **Keep queries concise** — 3-7 words is ideal
2. **Include temporal markers** if recency matters: add "2025" or "latest" or "today"
3. **Be specific**: "Python file handling tutorial" not "how to use python"
4. **For product queries**: include brand + model + year

### Good Query Examples
| User Says | Search Query |
|---|---|
| "What's happening in tech today?" | `tech news today 2025` |
| "How do I center a div in CSS?" | `center div CSS flexbox` |
| "Best laptops under $1000" | `best laptops under 1000 dollars 2025` |
| "What is Claude AI?" | `Claude AI Anthropic` |

---

## RESULT PROCESSING

After receiving search results:

1. **Read the top 3 results**
2. **Synthesize** — don't copy-paste; rewrite in clear, conversational language
3. **Cite source** if factual claim is made: "(Source: Forbes)"
4. **Flag if outdated**: if results are >6 months old for a fast-changing topic, note it

---

## RESPONSE FORMAT

Keep web search responses:
- Concise (3-6 sentences unless user asked for detail)
- Conversational (not bullet-point lists unless comparing items)
- Actionable (what can the user do with this info?)

---

## ANTI-HALLUCINATION RULES

1. **Never answer a search query from memory** if `web_search` was the right tool — always actually call it
2. **Never fabricate search results** — only report what the tool returned
3. **If results are irrelevant**, say "I couldn't find a great answer for that — here's what I found:" and report honestly

---

## EXAMPLE INTERACTIONS

### "What's the weather like in Mumbai today?"
```
Query: "Mumbai weather today"
Process: Read result, extract temperature and conditions
Report: "In Mumbai right now it's about 32°C (90°F) with humid conditions and partly cloudy skies. Expect some chance of afternoon showers."
```

### "Search for the latest news about Apple"
```
Query: "Apple news today 2025"
Process: Top 3 headlines
Report: Summarize 2-3 stories in plain language with source attribution
```
