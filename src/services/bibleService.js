const BASE_URL = "https://bible.helloao.org/api";
const VERSION = "spa_r09";

const LIBROS = {
  "genesis": "GEN",
  "exodo": "EXO",
  "levitico": "LEV",
  "numeros": "NUM",
  "deuteronomio": "DEU",
  "josue": "JOS",
  "jueces": "JDG",
  "rut": "RUT",
  "1 samuel": "1SA",
  "2 samuel": "2SA",
  "1 reyes": "1KI",
  "2 reyes": "2KI",
  "1 cronicas": "1CH",
  "2 cronicas": "2CH",
  "esdras": "EZR",
  "nehemias": "NEH",
  "ester": "EST",
  "job": "JOB",
  "salmo": "PSA",
  "salmos": "PSA",
  "proverbios": "PRO",
  "eclesiastes": "ECC",
  "cantares": "SNG",
  "isaias": "ISA",
  "jeremias": "JER",
  "lamentaciones": "LAM",
  "ezequiel": "EZK",
  "daniel": "DAN",
  "oseas": "HOS",
  "joel": "JOL",
  "amos": "AMO",
  "abdias": "OBA",
  "jonas": "JON",
  "miqueas": "MIC",
  "nahum": "NAM",
  "habacuc": "HAB",
  "sofonias": "ZEP",
  "hageo": "HAG",
  "zacarias": "ZEC",
  "malaquias": "MAL",

  "mateo": "MAT",
  "marcos": "MRK",
  "lucas": "LUK",
  "juan": "JHN",
  "hechos": "ACT",
  "romanos": "ROM",
  "1 corintios": "1CO",
  "2 corintios": "2CO",
  "galatas": "GAL",
  "efesios": "EPH",
  "filipenses": "PHP",
  "colosenses": "COL",
  "1 tesalonicenses": "1TH",
  "2 tesalonicenses": "2TH",
  "1 timoteo": "1TI",
  "2 timoteo": "2TI",
  "tito": "TIT",
  "filemon": "PHM",
  "hebreos": "HEB",
  "santiago": "JAS",
  "1 pedro": "1PE",
  "2 pedro": "2PE",
  "1 juan": "1JN",
  "2 juan": "2JN",
  "3 juan": "3JN",
  "judas": "JUD",
  "apocalipsis": "REV"
};

function normalizar(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function analizarReferencia(referencia) {
  const limpia = String(referencia || "")
    .trim()
    .replace(/\.$/, "");

  const match =
    limpia.match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);

  if (!match) {
    return null;
  }

  const nombreLibro =
    normalizar(match[1]);

  const libro =
    LIBROS[nombreLibro];

  if (!libro) {
    return null;
  }

  const capitulo =
    Number(match[2]);

  const inicio =
    Number(match[3]);

  const fin =
    match[4]
      ? Number(match[4])
      : inicio;

  if (
    !Number.isInteger(capitulo) ||
    !Number.isInteger(inicio) ||
    !Number.isInteger(fin) ||
    capitulo < 1 ||
    inicio < 1 ||
    fin < inicio ||
    fin - inicio > 30
  ) {
    return null;
  }

  return {
    referenciaOriginal: limpia,
    libro,
    capitulo,
    inicio,
    fin
  };
}

function contenidoATexto(contenido) {
  if (!Array.isArray(contenido)) {
    return "";
  }

  return contenido
    .map(elemento => {
      if (typeof elemento === "string") {
        return elemento;
      }

      if (
        elemento &&
        typeof elemento === "object"
      ) {
        if (typeof elemento.text === "string") {
          return elemento.text;
        }

        /*
          Elementos de formato:
          { text: "...", ... }
          u otras estructuras internas.
        */
        if (Array.isArray(elemento.content)) {
          return contenidoATexto(
            elemento.content
          );
        }
      }

      return "";
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function extraerVersiculos(
  datos,
  inicio,
  fin
) {
  const encontrados = [];

  const contenido =
    datos?.chapter?.content;

  if (!Array.isArray(contenido)) {
    return encontrados;
  }

  for (const elemento of contenido) {
    if (
      elemento?.type !== "verse"
    ) {
      continue;
    }

    const numero =
      Number(elemento.number);

    if (
      !Number.isInteger(numero) ||
      numero < inicio ||
      numero > fin
    ) {
      continue;
    }

    const texto =
      contenidoATexto(
        elemento.content
      );

    if (texto) {
      encontrados.push({
        numero,
        texto
      });
    }
  }

  return encontrados;
}

export async function obtenerVersiculo(
  referencia
) {
  const ref =
    analizarReferencia(referencia);

  if (!ref) {
    return {
      ok: false,
      error:
        "Referencia no válida. Ejemplo: Romanos 8:1"
    };
  }

  try {
    const url =
      `${BASE_URL}/${VERSION}/${ref.libro}/${ref.capitulo}.json`;

    const respuesta =
      await fetch(url);

    if (!respuesta.ok) {
      return {
        ok: false,
        error:
          "No encontré esa referencia bíblica."
      };
    }

    const datos =
      await respuesta.json();

    const versiculos =
      extraerVersiculos(
        datos,
        ref.inicio,
        ref.fin
      );

    if (!versiculos.length) {
      return {
        ok: false,
        error:
          "No encontré ese versículo en el capítulo."
      };
    }

    const texto =
      versiculos
        .map(
          v =>
            `${v.numero}. ${v.texto}`
        )
        .join("\n");

    return {
      ok: true,
      referencia:
        ref.referenciaOriginal,
      texto,
      version:
        "Reina-Valera 1909"
    };

  } catch (error) {
    console.error(
      "❌ Error consultando Biblia:",
      error.message
    );

    return {
      ok: false,
      error:
        "No pude consultar la Biblia en este momento."
    };
  }
}
