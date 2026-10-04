import type { Locale } from "../types/locale";
import dictionary from "./generated/fr";

export default {
  language: "FR",
  intlLocale: "fr-FR",
  dictionary,
  categories: {
    DutyRoulette: "Missions aléatoires",
    Dungeons: "Donjons",
    Guildhests: "Opérations de guilde",
    Trials: "Défis",
    Raids: "Raids",
    HighEndDuty: "Missions à difficulté élevée",
    Pvp: "JcJ",
    GoldSaucer: "Gold Saucer",
    Fates: "ALÉA",
    TreasureHunt: "Chasse aux trésors",
    TheHunt: "Contrats de chasse",
    GatheringForays: "Récolte",
    DeepDungeons: "Donjons sans fond",
    AdventuringForays: "Missions d'exploration",
    None: "Autres",
    "V&C Dungeon Finder": "Donjons spéciaux",
  },
  jobs: {
    PLD: "paladin",
    GLA: "gladiateur",
    WAR: "guerrier",
    MRD: "maraudeur",
    DRK: "chevalier noir",
    GNB: "pistosabreur",
    WHM: "mage blanc",
    CNJ: "élémentaliste",
    SCH: "érudit",
    AST: "astromancien",
    SGE: "sage",
    MNK: "moine",
    PGL: "pugiliste",
    DRG: "chevalier dragon",
    LNC: "maître d'hast",
    NIN: "ninja",
    ROG: "surineur",
    SAM: "samouraï",
    RPR: "faucheur",
    VPR: "rôdeur vipère",
    BSM: "dresseur",
    BRD: "barde",
    ARC: "archer",
    MCH: "machiniste",
    DNC: "danseur",
    BLM: "mage noir",
    THM: "occultiste",
    SMN: "invocateur",
    ACN: "arcaniste",
    RDM: "mage rouge",
    PCT: "pictomancien",
    BLU: "mage bleu",
    ANY: "Tous",
  },
  tags: {
    None: "Non spécifié",
    "Duty Completion": "Réussir la mission",
    Practice: "Entraînement",
    Loot: "Plusieurs fois",
    "Duty Complete": "Déjà terminé",
    "One Player per Job": "Pas plus d'un joueur par job",
  },
  messages: {
    logs: {
      modules: {
        language: "Langue",
        startup: "Démarrage",
        commands: "Commandes",
        connection: "Connexion",
        shutdown: "Arrêt",
        database: "Base de données",
        fetcher: "Récupération",
        monitor: "Surveillance",
        cleanup: "Nettoyage",
        subscription: "Abonnement",
        presence: "Statut",
        listing: "Annonce",
      },
      events: {
        unsupportedLanguage: "LANGUAGE non pris en charge ; utilisation de EN.",
        languageConfigured: "Langue du bot configurée",
        missingToken:
          "DISCORD_BOT_TOKEN est manquant ; vérifiez les variables d'environnement ou le fichier .env",
        commandLoaded: "Commande chargée",
        commandInvalid:
          "Impossible de charger la commande : propriété data ou execute manquante",
        commandLoadFailed: "Échec du chargement de la commande",
        commandNotFound: "Commande demandée introuvable",
        commandFailed: "Échec de l'exécution de la commande",
        commandErrorReplyFailed:
          "Impossible d'envoyer la réponse d'erreur de la commande",
        commandsRegistered: "Commandes du serveur enregistrées",
        commandsRegisterFailed:
          "Échec de l'enregistrement des commandes du serveur",
        guildJoined: "Le bot a rejoint un serveur",
        botReady: "Le bot est en ligne",
        initializationFailed:
          "Échec de l'initialisation de la base de données ou du démarrage de la surveillance",
        clientError: "Erreur du client Discord",
        clientWarning: "Avertissement du client Discord",
        connecting: "Connexion à Discord en cours",
        loginFailed: "Échec de la connexion à Discord",
        shuttingDown:
          "Arrêt du bot ; attente des tâches de surveillance et de nettoyage",
        shutdownComplete: "Bot arrêté",
        databaseOpened: "Base de données des abonnements ouverte",
        databaseClosed: "Base de données des abonnements fermée",
        listingsFetched: "Page de recherche d'équipe récupérée et analysée",
        expiryUnknown:
          "Expiration de l'annonce illisible ; délais enregistrés conservés, nouvelles publications expirant une heure après l'observation",
        monitorSkipped:
          "Aucune vérification nécessaire : aucun abonnement ni historique de publication",
        monitorFetchFailed:
          "Échec de la récupération des annonces ; nouvel essai à la prochaine vérification, nettoyage selon les délais enregistrés uniquement cette fois",
        channelUnavailable:
          "Salon inaccessible ou rattaché à un autre serveur ignoré ; historique conservé pour réessayer",
        channelCannotSend:
          "Impossible d'envoyer des messages dans le salon ; publication ignorée cette fois",
        invalidPatternSkipped:
          "Abonnement avec une expression régulière invalide ignoré",
        listingUpdated: "Message d'annonce mis à jour",
        listingSent: "Message d'annonce envoyé",
        deliveryFailed:
          "Échec de la publication de l'annonce ; nouvel essai à la prochaine vérification",
        channelProcessingFailed:
          "Échec du traitement du salon ; abonnements et historique conservés pour réessayer",
        monitorComplete: "Vérification terminée",
        monitorFailed:
          "Échec de la tâche de surveillance ; nouvel essai à la prochaine vérification",
        monitorCleanupFailed:
          "Échec du nettoyage automatique après la surveillance ; nouvel essai au prochain nettoyage",
        monitorStarted: "Surveillance de la recherche d'équipe démarrée",
        monitorStopped: "Surveillance de la recherche d'équipe arrêtée",
        scheduledCleanupFailed:
          "Échec du nettoyage planifié ; nouvel essai la prochaine fois",
        deliveryDeleted: "Message et historique de publication supprimés",
        deleteFailed:
          "Échec de la suppression ; historique de publication conservé pour réessayer",
        channelCleanupFailed:
          "Échec du nettoyage du salon ; historique conservé pour réessayer",
        cleanupFetchFailed:
          "Échec de la récupération ; nettoyage selon les délais enregistrés uniquement",
        cleanupComplete: "Nettoyage terminé",
        cleanupStarted: "Nettoyage horaire démarré",
        subscriptionCreated: "Abonnement à la recherche d'équipe créé",
        subscriptionEdited: "Abonnement à la recherche d'équipe modifié",
        subscriptionCancelled: "Abonnement à la recherche d'équipe annulé",
        presenceFailed: "Impossible de mettre à jour le statut du bot",
      },
      errors: {
        scopeRequired: "Le serveur et le salon doivent être renseignés",
        invalidPagination: "Paramètres de pagination invalides",
        channelUnavailable: "Salon inaccessible ou rattaché à un autre serveur",
        cleanupStopped: "Le service de nettoyage est arrêté",
        botShuttingDown: "Le bot est en cours d'arrêt",
        fetchNotHtml: "XIVPF n'a pas renvoyé de page HTML",
        fetchEmptyBody: "XIVPF a renvoyé un corps de réponse vide",
        fetchTooLarge:
          "Le HTML de XIVPF dépasse la limite de réponse de 16 MiB",
        missingListingsContainer:
          "Le conteneur des annonces XIVPF est absent ou ambigu",
        missingListingId: "L'annonce XIVPF n'a pas d'ID",
        fetchHttp: ({ status }) => `Erreur HTTP XIVPF : ${status}`,
      },
      invalidLanguage: ({ value, supported }) =>
        `LANGUAGE ${JSON.stringify(value)} non pris en charge ; utilisation de EN. Langues prises en charge : ${supported.join(", ")}.`,
    },
    common: {
      unknown: "Inconnu",
      unlimited: "Sans restriction",
      listSeparator: ", ",
      now: "Maintenant",
    },
    embed: {
      description: "📃 Commentaire",
      category: "🎯 Catégorie",
      server: "🌍 Monde",
      creator: "👤 Recruteur",
      minIlvl: "⚔️ Niveau d'objet moyen minimum",
      expires: "⏳ Temps restant",
      party: ({ current, total }) => `👨‍👩‍👧‍👦 Équipe (${current}/${total})`,
    },
    commands: {
      subscribe: "S'abonner aux annonces de recherche d'équipe dans ce salon",
      list: "Parcourir les abonnements de ce salon",
      edit: "Sélectionner et modifier un abonnement de ce salon",
      unsubscribe: "Sélectionner et annuler un abonnement de ce salon",
      clear:
        "Supprimer les messages et journaux d'envoi des recrutements terminés dans ce salon",
      reset:
        "Supprimer les messages et journaux d'envoi des abonnements sélectionnés ou de tous",
      page: "Numéro de page, 1 par défaut",
    },
    filters: ({ centres, categories }) =>
      `Centres de données : ${centres}\nCatégories : ${categories}`,
    form: {
      createTitle: "Créer un abonnement de recherche d'équipe",
      editTitle: "Modifier un abonnement de recherche d'équipe",
      pattern: "Expression régulière",
      patternDescription:
        "Filtre le nom anglais de la mission et le commentaire original. Syntaxe RE2, 1–1000 caractères.",
      dataCentres: "Centres de données",
      categories: "Catégories",
      multiSelect: "Choix multiples ; aucune sélection pour ne pas filtrer",
      createTimeout: "ℹ️ Délai dépassé. Aucun abonnement n'a été créé.",
      editTimeout: "ℹ️ Délai dépassé. Aucune modification n'a été enregistrée.",
      created: ({ pattern, filters, id }) =>
        `✅ Abonnement créé dans ce salon.\nExpression : ${pattern}\n${filters}\nID : ${id}`,
      edited: ({ pattern, filters, id }) =>
        `✅ Abonnement modifié dans ce salon.\nExpression : ${pattern}\n${filters}\nID : ${id}`,
    },
    pager: {
      empty: "ℹ️ Ce salon n'a aucun abonnement.",
      summary: ({ total, page, pageCount }) =>
        `📋 **Abonnements de ce salon** (${total}) | Page ${page}/${pageCount}`,
      item: ({ index, pattern, filters, id, userId }) =>
        `\n\n${index}. ${pattern}\n${filters}\nID : ${id} | Créé par : <@${userId}>`,
      selectEdit: "\nSélectionnez un abonnement à modifier :",
      selectDelete: "\nSélectionnez un abonnement à annuler :",
      selectReset:
        "\nSélectionnez un abonnement pour supprimer ses messages et journaux d'envoi, y compris les recrutements actifs. Les paramètres sont conservés ; les recrutements actifs peuvent être renvoyés au prochain contrôle. Les messages partagés sont aussi supprimés.",
      placeholder: "Sélectionnez un abonnement de cette page",
      emptyPattern: "(Expression vide)",
      all: "Tous les abonnements",
      allDescription:
        "Supprimer tous les messages et journaux d'envoi de recrutement, même des abonnements annulés",
      previous: "Précédent",
      next: "Suivant",
      resetting: "⏳ Suppression en cours…",
      editOpened:
        "ℹ️ Modifiez l'expression, les centres de données et les catégories, puis validez le formulaire.",
      cancelled: "✅ Abonnement annulé.",
    },
    errors: {
      PATTERN_LENGTH: "L'expression régulière doit contenir 1–1000 caractères",
      INVALID_PATTERN: "Expression régulière RE2 invalide",
      INVALID_DATA_CENTRE: "Centre de données invalide",
      INVALID_CATEGORY: "Catégorie invalide",
      DUPLICATE_SUBSCRIPTION:
        "Ce salon possède déjà un abonnement avec la même expression et les mêmes filtres",
      SUBSCRIPTION_NOT_FOUND: "Abonnement introuvable ou accès refusé.",
      guildOnly: "Utilisez cette commande dans un salon de serveur.",
      channelOnly:
        "Seuls les salons textuels, les salons d'annonces et les fils sont pris en charge.",
      userPermissions: "Vous devez pouvoir voir et gérer ce salon.",
      threadClosed: "Ce fil est archivé ou verrouillé. Restaurez-le d'abord.",
      botPermissions:
        "Le bot doit pouvoir voir le salon, envoyer des messages et intégrer des liens.",
      botTimedOut: "Le bot est en exclusion temporaire. Retirez-la d'abord.",
      privateThread:
        "Le bot n'a pas accès à ce fil privé. Ajoutez-le au fil et vérifiez les permissions.",
      commandFailed: "❌ Échec de la commande",
    },
    cleanup: {
      result: ({ removed, failed }) =>
        `${removed} messages et journaux d'envoi supprimés ; ${failed} échecs (journaux conservés pour réessayer). Les paramètres des abonnements sont conservés.`,
      fetchFailed:
        "\nÉchec de la récupération ; seules les échéances déjà enregistrées ont servi au nettoyage.",
      unlinked: ({ count }) =>
        `\n${count} anciens journaux d'envoi ne sont liés à aucun abonnement. Sélectionnez « Tous les abonnements » pour les supprimer.`,
    },
    presence: {
      fetching:
        "Récupération et traitement des annonces de recherche d'équipe…",
      clearing: "Nettoyage des recrutements terminés…",
      noNextTime: "Aucune exécution prévue",
      next: ({ time }) => `Prochaine exécution : ${time}`,
    },
  },
} satisfies Locale;
