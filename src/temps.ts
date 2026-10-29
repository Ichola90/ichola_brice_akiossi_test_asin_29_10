/**
 * Utilitaires de gestion du temps pour le guichet de prise de rendez-vous (Bénin, UTC+1).
 *
 * Le Bénin est situé sur le fuseau West Africa Time (WAT, UTC+1) sans heure d'été.
 * Toutes les règles de gestion s'appliquent sur l'"heure murale" béninoise.
 * Pour garantir la stricte indépendance vis-à-vis du fuseau horaire de la machine
 * exécutant le code, toutes les manipulations utilisent Date.UTC et les accesseurs UTC.
 */

export interface DateHeureBenin {
  annee: number;
  mois: number; // 1-12
  jour: number; // 1-31
  heures: number; // 0-23
  minutes: number; // 0-59
  secondes: number; // 0-59
  jourSemaine: number; // 0 = Dimanche, 1 = Lundi, ..., 6 = Samedi
  timestampMs: number; // Timestamp Date.UTC représentant l'heure murale
  chaineIso: string; // Format normalisé AAAA-MM-JJTHH:MM
}

/**
 * Regex stricte requise pour la prise de rendez-vous : AAAA-MM-JJTHH:MM
 */
const REGEX_STRICTE_CRENEAU = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/**
 * Regex tolérante pour now et les rendez-vous existants (ex: export SQL avec espace et secondes)
 */
const REGEX_SOUPLE_DATE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

/**
 * Analyse et valide une date/heure dans le référentiel horaire béninois.
 *
 * @param valeur Chaîne ISO ou Date
 * @param strict Si true, applique la regex stricte AAAA-MM-JJTHH:MM (pour la prise de RDV)
 * @returns DateHeureBenin si valide, null si le format ou le calendrier est invalide
 */
export function parserDateHeureBenin(valeur: unknown, strict = false): DateHeureBenin | null {
  if (valeur instanceof Date) {
    if (isNaN(valeur.getTime())) {
      return null;
    }
    // Date représente un instant absolu. On le projette en heure murale béninoise (UTC+1).
    const decallageBeninMs = 60 * 60 * 1000;
    const d = new Date(valeur.getTime() + decallageBeninMs);

    const annee = d.getUTCFullYear();
    const mois = d.getUTCMonth() + 1;
    const jour = d.getUTCDate();
    const heures = d.getUTCHours();
    const minutes = d.getUTCMinutes();
    const secondes = d.getUTCSeconds();
    const jourSemaine = d.getUTCDay();
    const timestampMs = Date.UTC(annee, mois - 1, jour, heures, minutes, secondes, 0);

    const pad = (n: number) => n.toString().padStart(2, "0");
    const chaineIso = `${annee}-${pad(mois)}-${pad(jour)}T${pad(heures)}:${pad(minutes)}`;

    return {
      annee,
      mois,
      jour,
      heures,
      minutes,
      secondes,
      jourSemaine,
      timestampMs,
      chaineIso,
    };
  }

  if (typeof valeur !== "string") {
    return null;
  }

  const regex = strict ? REGEX_STRICTE_CRENEAU : REGEX_SOUPLE_DATE;
  const match = regex.exec(valeur.trim());
  if (!match) {
    return null;
  }

  const annee = parseInt(match[1]!, 10);
  const mois = parseInt(match[2]!, 10);
  const jour = parseInt(match[3]!, 10);
  const heures = parseInt(match[4]!, 10);
  const minutes = parseInt(match[5]!, 10);
  const secondes = match[6] !== undefined ? parseInt(match[6], 10) : 0;

  // Validation des plages basiques
  if (
    mois < 1 || mois > 12 ||
    jour < 1 || jour > 31 ||
    heures < 0 || heures > 23 ||
    minutes < 0 || minutes > 59 ||
    secondes < 0 || secondes > 59
  ) {
    return null;
  }

  // Validation calendaire stricte via Date.UTC (détecte 2026-02-30, 2026-04-31, etc.)
  const d = new Date(Date.UTC(annee, mois - 1, jour, heures, minutes, secondes, 0));
  if (
    d.getUTCFullYear() !== annee ||
    d.getUTCMonth() !== mois - 1 ||
    d.getUTCDate() !== jour ||
    d.getUTCHours() !== heures ||
    d.getUTCMinutes() !== minutes ||
    d.getUTCSeconds() !== secondes
  ) {
    return null;
  }

  const jourSemaine = d.getUTCDay();
  const timestampMs = d.getTime();

  const pad = (n: number) => n.toString().padStart(2, "0");
  const chaineIso = `${annee}-${pad(mois)}-${pad(jour)}T${pad(heures)}:${pad(minutes)}`;

  return {
    annee,
    mois,
    jour,
    heures,
    minutes,
    secondes,
    jourSemaine,
    timestampMs,
    chaineIso,
  };
}

/**
 * Vérifie si la date tombe un week-end (samedi ou dimanche).
 */
export function estWeekend(date: DateHeureBenin): boolean {
  return date.jourSemaine === 0 || date.jourSemaine === 6;
}

/**
 * Vérifie si l'heure du créneau respecte la grille officielle :
 * Du lundi au vendredi (le contrôle week-end est distinct), de 08:00 à 15:30, toutes les 30 minutes.
 * Créneaux valides : 08:00, 08:30, 09:00, ..., 15:00, 15:30.
 */
export function estCreneauGrilleValide(date: DateHeureBenin): boolean {
  if (date.secondes !== 0) {
    return false;
  }
  if (date.minutes !== 0 && date.minutes !== 30) {
    return false;
  }
  const totalMinutes = date.heures * 60 + date.minutes;
  const debutGrille = 8 * 60; // 08:00
  const finGrille = 15 * 60 + 30; // 15:30 (dernier créneau)

  return totalMinutes >= debutGrille && totalMinutes <= finGrille;
}

/**
 * Calcule la différence en minutes entre deux dates béninoises (dateFin - dateDebut).
 */
export function differenceMinutes(dateFin: DateHeureBenin, dateDebut: DateHeureBenin): number {
  return Math.floor((dateFin.timestampMs - dateDebut.timestampMs) / (60 * 1000));
}
