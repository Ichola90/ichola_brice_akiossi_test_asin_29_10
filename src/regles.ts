import {
  DateHeureBenin,
  parserDateHeureBenin,
  estWeekend,
  estCreneauGrilleValide,
  differenceMinutes,
} from "./temps.js";
import {
  DemandePriseRendezVous,
  RendezVous,
  ResultatRegle,
  PageRendezVous,
  MESSAGES,
  SERVICES_AUTORISES,
  STATUTS_CLOTURE_AUTORISES,
} from "./types.js";

const REGEX_NPI_STRICT = /^\d{10}$/;

/**
 * Valide une demande de prise de rendez-vous selon les règles métier de l'ASIN.
 *
 * Ordre strict des contrôles :
 * 1. NPI (exactement 10 chiffres en chaîne)
 * 2. Service (PASSEPORT, CNI, PERMIS)
 * 3. Format date/heure (AAAA-MM-JJTHH:MM et date calendrier existante)
 * 4. Date passée (< now)
 * 5. Week-end (samedi / dimanche fermé)
 * 6. Heure de la grille (08:00 à 15:30 par pas de 30 min)
 * 7. Déjà un rendez-vous à venir pour ce NPI (statut "confirme" et date >= now)
 * 8. Créneau complet (>= 3 usagers avec statut non-annulé sur le même créneau)
 *
 * @param demande Informations transmises (npi, service, dateHeure)
 * @param rendezVousExistants Liste des rendez-vous existants
 * @param now Horodatage de référence
 * @returns { ok: true } ou { ok: false, status, message }
 */
export function verifierPriseRendezVous(
  demande: DemandePriseRendezVous,
  rendezVousExistants: RendezVous[],
  now: string | Date
): ResultatRegle {
  // 1. Contrôle NPI
  if (typeof demande.npi !== "string" || !REGEX_NPI_STRICT.test(demande.npi)) {
    return { ok: false, status: 400, message: MESSAGES.NPI_INVALIDE };
  }

  // 2. Contrôle Service
  if (typeof demande.service !== "string" || !SERVICES_AUTORISES.has(demande.service)) {
    return { ok: false, status: 400, message: MESSAGES.SERVICE_INCONNU };
  }

  // 3. Contrôle format et validité calendrier de la date
  const creneau = parserDateHeureBenin(demande.dateHeure, true);
  if (!creneau) {
    return { ok: false, status: 400, message: MESSAGES.DATE_INVALIDE };
  }

  // Parse de now
  const nowBenin = parserDateHeureBenin(now, false);
  if (!nowBenin) {
    return { ok: false, status: 400, message: MESSAGES.DATE_INVALIDE };
  }

  // 4. Contrôle date passée (< now)
  if (creneau.timestampMs < nowBenin.timestampMs) {
    return { ok: false, status: 409, message: MESSAGES.DATE_PASSEE };
  }

  // 5. Contrôle week-end
  if (estWeekend(creneau)) {
    return { ok: false, status: 409, message: MESSAGES.FERME_WEEKEND };
  }

  // 6. Contrôle grille horaire
  if (!estCreneauGrilleValide(creneau)) {
    return { ok: false, status: 409, message: MESSAGES.HORS_GRILLE };
  }

  // 7. Contrôle déjà un rendez-vous à venir (statut confirme ET date_heure >= now)
  const npiDemandeur = demande.npi;
  const aDejaRdvAVenir = rendezVousExistants.some((rdv) => {
    if (rdv.npi !== npiDemandeur || rdv.statut !== "confirme") {
      return false;
    }
    const rdvDate = parserDateHeureBenin(rdv.dateHeure, false);
    if (!rdvDate) {
      return false;
    }
    return rdvDate.timestampMs >= nowBenin.timestampMs;
  });

  if (aDejaRdvAVenir) {
    return { ok: false, status: 409, message: MESSAGES.DEJA_A_VENIR };
  }

  // 8. Contrôle créneau plein (>= 3 usagers au statut non-annulé)
  let nbNonAnnulesSurCreneau = 0;
  for (const rdv of rendezVousExistants) {
    if (rdv.statut === "annule") {
      continue;
    }
    const rdvDate = parserDateHeureBenin(rdv.dateHeure, false);
    if (rdvDate && rdvDate.chaineIso === creneau.chaineIso) {
      nbNonAnnulesSurCreneau++;
      if (nbNonAnnulesSurCreneau >= 3) {
        return { ok: false, status: 409, message: MESSAGES.CRENEAU_COMPLET };
      }
    }
  }

  return { ok: true };
}

/**
 * Valide la demande d'annulation d'un rendez-vous par l'usager.
 *
 * Règles :
 * 1. Le rendez-vous doit être au statut 'confirme'. S'il est 'honore', 'absent' ou déjà 'annule',
 *    il ne peut plus être annulé (409).
 * 2. L'annulation doit être demandée au moins 24 h avant l'heure prévue du rendez-vous (409).
 *    Exactement 24 h pile (1440 min) est autorisé.
 *
 * @param rendezVous Le rendez-vous à annuler
 * @param now Horodatage au moment de la demande d'annulation
 */
export function verifierAnnulation(
  rendezVous: RendezVous | null | undefined,
  now: string | Date
): ResultatRegle {
  if (!rendezVous || typeof rendezVous !== "object") {
    return { ok: false, status: 400, message: MESSAGES.ANNULATION_NON_CONFIRME };
  }

  // 1. Contrôle du statut courant
  if (rendezVous.statut !== "confirme") {
    return { ok: false, status: 409, message: MESSAGES.ANNULATION_NON_CONFIRME };
  }

  // 2. Contrôle du délai d'annulation (>= 24 h)
  const rdvDate = parserDateHeureBenin(rendezVous.dateHeure, false);
  const nowDate = parserDateHeureBenin(now, false);

  if (!rdvDate || !nowDate) {
    return { ok: false, status: 400, message: MESSAGES.DATE_INVALIDE };
  }

  const minutesRestantes = differenceMinutes(rdvDate, nowDate);
  const SEUIL_24_HEURES_MINUTES = 24 * 60; // 1440 minutes

  if (minutesRestantes < SEUIL_24_HEURES_MINUTES) {
    return { ok: false, status: 409, message: MESSAGES.ANNULATION_TARDIVE };
  }

  return { ok: true };
}

/**
 * Valide le changement de statut d'un rendez-vous au guichet par un agent.
 *
 * Règles :
 * 1. Le statut demandé doit être strictement 'honore' ou 'absent' (400).
 *    Les statuts 'annule', 'confirme', valeurs vides ou inattendues sont rejetés.
 * 2. Transition autorisée uniquement depuis 'confirme'. Si le rendez-vous est déjà
 *    clôturé ('honore', 'absent', 'annule'), la modification est refusée (409).
 *
 * @param rendezVous Le rendez-vous concerné
 * @param statutDemande Nouveau statut demandé
 */
export function verifierChangementStatut(
  rendezVous: RendezVous | null | undefined,
  statutDemande: unknown
): ResultatRegle {
  // 1. Contrôle du statut demandé
  if (typeof statutDemande !== "string" || !STATUTS_CLOTURE_AUTORISES.has(statutDemande)) {
    return { ok: false, status: 400, message: MESSAGES.STATUT_INCONNU };
  }

  if (!rendezVous || typeof rendezVous !== "object") {
    return { ok: false, status: 400, message: MESSAGES.DEJA_CLOTURE };
  }

  // 2. Contrôle de l'état courant : seuls les rendez-vous "confirme" peuvent être clôturés
  if (rendezVous.statut !== "confirme") {
    return { ok: false, status: 409, message: MESSAGES.DEJA_CLOTURE };
  }

  return { ok: true };
}

/**
 * Liste, ordonne et pagine les rendez-vous d'un usager selon les spécifications métier ASIN :
 * 1. Filtrage sur le NPI
 * 2. Tri métier :
 *    - Le prochain rendez-vous (statut "confirme" et date_heure >= now, le plus proche) en tête absolue
 *    - Tous les autres rendez-vous ordonnés par date_heure décroissante (départage par id décroissant)
 * 3. Découpage en pages (par défaut 10 éléments par page)
 *
 * @param rendezVous Liste de tous les rendez-vous
 * @param npi Identifiant NPI de l'usager
 * @param now Date de référence
 * @param page Numéro de page (1-indexé)
 * @param parPage Taille de la page
 * @returns PageRendezVous { page, parPage, total, totalPages, rendezVous }
 */
export function listerRendezVousUsager(
  rendezVous: RendezVous[],
  npi: string,
  now: string | Date,
  page = 1,
  parPage = 10
): PageRendezVous {
  const p = typeof page === "number" && !isNaN(page) && page >= 1 ? Math.floor(page) : 1;
  const limit = typeof parPage === "number" && !isNaN(parPage) && parPage >= 1 ? Math.floor(parPage) : 10;

  const nowBenin = parserDateHeureBenin(now, false);
  const nowMs = nowBenin ? nowBenin.timestampMs : 0;

  // 1. Filtrage strict sur le NPI
  const usagerRdv = rendezVous.filter((r) => r.npi === npi);
  const total = usagerRdv.length;
  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  // 2. Recherche du prochain rendez-vous (confirmé à venir, le plus proche dans le temps)
  let prochainRdv: RendezVous | null = null;
  let prochainRdvMs = Infinity;

  for (const rdv of usagerRdv) {
    if (rdv.statut === "confirme") {
      const parsed = parserDateHeureBenin(rdv.dateHeure, false);
      if (parsed && parsed.timestampMs >= nowMs) {
        if (parsed.timestampMs < prochainRdvMs) {
          prochainRdvMs = parsed.timestampMs;
          prochainRdv = rdv;
        } else if (parsed.timestampMs === prochainRdvMs && prochainRdv && rdv.id < prochainRdv.id) {
          // Départage déterministe
          prochainRdv = rdv;
        }
      }
    }
  }

  // 3. Séparation et tri des autres rendez-vous par date_heure décroissante (départage id décroissant)
  const autresRdv = usagerRdv.filter((r) => r !== prochainRdv);

  autresRdv.sort((a, b) => {
    const da = parserDateHeureBenin(a.dateHeure, false)?.timestampMs ?? 0;
    const db = parserDateHeureBenin(b.dateHeure, false)?.timestampMs ?? 0;
    if (db !== da) {
      return db - da; // Décroissant par date
    }
    return b.id - a.id; // Départage par id décroissant
  });

  const listeOrdonnee: RendezVous[] = prochainRdv
    ? [prochainRdv, ...autresRdv]
    : autresRdv;

  // 4. Découpage en pages (pagination)
  if (p > totalPages || total === 0) {
    return {
      page: p,
      parPage: limit,
      total,
      totalPages,
      rendezVous: [],
    };
  }

  const debut = (p - 1) * limit;
  const fin = debut + limit;
  const pageItems = listeOrdonnee.slice(debut, fin);

  return {
    page: p,
    parPage: limit,
    total,
    totalPages,
    rendezVous: pageItems,
  };
}
