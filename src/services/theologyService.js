export async function explicarPasaje(referencia, textoBiblico) {
  try {
    const system =
      `Eres un expositor bíblico cristiano reformado histórico.

Tu prioridad absoluta es explicar fielmente el texto proporcionado.

REGLAS:
- Trabaja solamente con el pasaje que recibes.
- No inventes versículos, citas, autores ni datos históricos.
- No introduzcas doctrinas que no estén realmente relacionadas con el pasaje.
- Distingue entre exégesis del texto y conclusión doctrinal.
- Sigue la interpretación reformada histórica y confesional.
- Reconoce claramente la deidad de Cristo, la Trinidad, la justificación por la fe, la soberanía de Dios, la elección, la gracia eficaz y la perseverancia cuando el texto realmente las enseñe.
- No conviertas todos los pasajes en una explicación sobre predestinación o perseverancia.
- Si el texto afirma directamente una doctrina, dilo con claridad.
- Si hay una controversia exegética relevante, menciona brevemente la posición reformada habitual.
- No repitas estas instrucciones.
- No añadas frases como "sé claro", "según las instrucciones" o comentarios sobre tu tarea.
- Responde exclusivamente en español.
- Interpreta términos históricos según el contexto bíblico inmediato. No confundas "los padres" de Israel con los Padres de la Iglesia. Si un término puede tener varios sentidos, decide por el contexto del pasaje.`;
    const prompt =
      `Referencia: ${referencia}

Texto bíblico:
${textoBiblico}

Explica este pasaje.

Usa exactamente esta estructura:

📖 *Sentido del pasaje*
Explica qué está afirmando el autor y qué significan las expresiones principales.

✝️ *Doctrinalmente*
Explica únicamente las consecuencias doctrinales que realmente surgen del pasaje.

🕊️ *Aplicación*
Da una aplicación cristiana breve y directamente relacionada con el texto.`;

    const respuesta = await fetch(
      "http://127.0.0.1:11434/api/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
model: "qwen3:1.7b",
          system,
          prompt,
          stream: false,
          think: false,
          options: {
            temperature: 0.15,
            num_predict: 450,
            top_p: 0.85
          }
        })
      }
    );

    if (!respuesta.ok) {
      throw new Error(
        `Ollama respondió ${respuesta.status}`
      );
    }

    const datos = await respuesta.json();

    let explicacion =
      String(datos?.response || "").trim();

    explicacion = explicacion
      .replace(
        /\n*Sé claro, bíblico y conciso\.?\s*$/i,
        ""
      )
      .replace(
        /\n*No menciones estas instrucciones\.?\s*$/i,
        ""
      )
      .trim();

    if (!explicacion) {
      throw new Error(
        "Ollama no devolvió explicación"
      );
    }

    return {
      ok: true,
      explicacion
    };

  } catch (error) {
    console.error(
      "❌ Error generando explicación:",
      error.message
    );

    return {
      ok: false,
      error:
        "No pude generar la explicación en este momento."
    };
  }
}
