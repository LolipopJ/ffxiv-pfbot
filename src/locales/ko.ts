import type { Locale } from "../types/locale";
import dictionary from "./generated/ko";

export default {
  language: "KO",
  intlLocale: "ko-KR",
  dictionary,
  categories: {
    DutyRoulette: "무작위 임무",
    Dungeons: "던전",
    Guildhests: "길드 작전",
    Trials: "토벌전",
    Raids: "레이드",
    HighEndDuty: "고난도 임무",
    Pvp: "PvP",
    GoldSaucer: "골드 소서",
    Fates: "돌발 임무",
    TreasureHunt: "보물찾기",
    TheHunt: "마물 사냥",
    GatheringForays: "채집 활동",
    DeepDungeons: "딥 던전",
    AdventuringForays: "특수 필드 탐색",
    None: "기타",
    "V&C Dungeon Finder": "특수 던전 탐색",
  },
  jobs: {
    PLD: "나이트",
    GLA: "검술사",
    WAR: "전사",
    MRD: "도끼술사",
    DRK: "암흑기사",
    GNB: "건브레이커",
    WHM: "백마도사",
    CNJ: "환술사",
    SCH: "학자",
    AST: "점성술사",
    SGE: "현자",
    MNK: "몽크",
    PGL: "격투사",
    DRG: "용기사",
    LNC: "창술사",
    NIN: "닌자",
    ROG: "쌍검사",
    SAM: "사무라이",
    RPR: "리퍼",
    VPR: "바이퍼",
    BSM: "BST",
    BRD: "음유시인",
    ARC: "궁술사",
    MCH: "기공사",
    DNC: "무도가",
    BLM: "흑마도사",
    THM: "주술사",
    SMN: "소환사",
    ACN: "비술사",
    RDM: "적마도사",
    PCT: "픽토맨서",
    BLU: "청마도사",
    ANY: "누구나 가능",
  },
  tags: {
    None: "설정 안 함",
    "Duty Completion": "완료 목적",
    Practice: "연습",
    Loot: "반복 공략",
    "Duty Complete": "공략 완료",
    "One Player per Job": "잡 중복 없음",
  },
  messages: {
    logs: {
      modules: {
        language: "언어",
        startup: "시작",
        commands: "명령어",
        connection: "연결",
        shutdown: "종료",
        database: "데이터베이스",
        fetcher: "가져오기",
        monitor: "모니터링",
        cleanup: "정리",
        subscription: "구독",
        presence: "상태",
        listing: "모집",
      },
      events: {
        unsupportedLanguage: "지원하지 않는 LANG입니다. EN을 사용합니다.",
        languageConfigured: "봇 언어가 설정되었습니다",
        missingToken:
          "DISCORD_BOT_TOKEN이 없습니다. 환경 변수 또는 .env 파일을 확인하세요",
        commandLoaded: "명령어를 불러왔습니다",
        commandInvalid:
          "명령어를 불러올 수 없습니다. data 또는 execute 속성이 없습니다",
        commandLoadFailed: "명령어를 불러오지 못했습니다",
        commandNotFound: "요청한 명령어를 찾을 수 없습니다",
        commandFailed: "명령어 실행에 실패했습니다",
        commandErrorReplyFailed: "명령어 오류 응답을 보내지 못했습니다",
        commandsRegistered: "서버 명령어를 등록했습니다",
        commandsRegisterFailed: "서버 명령어 등록에 실패했습니다",
        guildJoined: "봇이 서버에 참가했습니다",
        botReady: "봇이 온라인 상태가 되었습니다",
        initializationFailed:
          "데이터베이스 초기화 또는 모니터링 시작에 실패했습니다",
        clientError: "Discord 클라이언트 오류",
        clientWarning: "Discord 클라이언트 경고",
        connecting: "Discord에 연결하는 중입니다",
        loginFailed: "Discord 로그인에 실패했습니다",
        shuttingDown:
          "봇을 종료하는 중입니다. 모니터링 및 정리 작업이 완료될 때까지 기다립니다",
        shutdownComplete: "봇을 종료했습니다",
        databaseOpened: "구독 데이터베이스를 열었습니다",
        databaseClosed: "구독 데이터베이스를 닫았습니다",
        listingsFetched: "파티 찾기 페이지를 가져와 분석했습니다",
        expiryUnknown:
          "모집 기한을 해석할 수 없습니다. 저장된 기한을 유지하며, 새 전송은 관측 후 1시간 뒤에 만료됩니다",
        monitorSkipped: "구독이나 전송 기록이 없어 이번 확인을 건너뜁니다",
        monitorFetchFailed:
          "모집을 가져오지 못했습니다. 다음 확인에서 다시 시도하며, 이번에는 저장된 기한만으로 정리합니다",
        channelUnavailable:
          "접근할 수 없거나 서버가 일치하지 않는 채널을 건너뜁니다. 재시도를 위해 기록을 유지합니다",
        channelCannotSend:
          "채널에 메시지를 보낼 수 없어 이번 전송을 건너뜁니다",
        invalidPatternSkipped: "정규식이 올바르지 않은 구독을 건너뜁니다",
        listingUpdated: "모집 메시지를 수정했습니다",
        listingSent: "모집 메시지를 보냈습니다",
        deliveryFailed:
          "모집 전송에 실패했습니다. 다음 확인에서 다시 시도합니다",
        channelProcessingFailed:
          "채널 처리에 실패했습니다. 재시도를 위해 구독과 전송 기록을 유지합니다",
        monitorComplete: "이번 확인을 완료했습니다",
        monitorFailed:
          "모니터링 작업에 실패했습니다. 다음 확인에서 다시 시도합니다",
        monitorCleanupFailed:
          "모니터링 후 자동 정리에 실패했습니다. 다음 정리에서 다시 시도합니다",
        monitorStarted: "파티 찾기 모니터링을 시작했습니다",
        monitorStopped: "파티 찾기 모니터링을 중지했습니다",
        scheduledCleanupFailed:
          "예약된 정리에 실패했습니다. 다음에 다시 시도합니다",
        deliveryDeleted: "메시지와 전송 기록을 삭제했습니다",
        deleteFailed:
          "삭제에 실패했습니다. 재시도를 위해 전송 기록을 유지합니다",
        channelCleanupFailed:
          "채널 정리에 실패했습니다. 재시도를 위해 기록을 유지합니다",
        cleanupFetchFailed:
          "가져오기에 실패했습니다. 저장된 기한만으로 정리합니다",
        cleanupComplete: "정리를 완료했습니다",
        cleanupStarted: "매시간 정리 작업을 시작했습니다",
        subscriptionCreated: "파티 찾기 구독을 만들었습니다",
        subscriptionEdited: "파티 찾기 구독을 수정했습니다",
        subscriptionCancelled: "파티 찾기 구독을 취소했습니다",
        presenceFailed: "봇 상태를 갱신하지 못했습니다",
      },
      errors: {
        scopeRequired: "서버와 채널 범위는 비어 있을 수 없습니다",
        invalidPagination: "페이지 매개변수가 올바르지 않습니다",
        channelUnavailable: "채널에 접근할 수 없거나 서버가 일치하지 않습니다",
        cleanupStopped: "정리 서비스가 중지되었습니다",
        botShuttingDown: "봇이 종료 중입니다",
        fetchNotHtml: "XIVPF가 HTML 페이지를 반환하지 않았습니다",
        fetchEmptyBody: "XIVPF가 빈 응답 본문을 반환했습니다",
        fetchTooLarge: "XIVPF HTML이 응답 제한인 16 MiB를 초과했습니다",
        missingListingsContainer: "XIVPF 모집 컨테이너가 없거나 여러 개입니다",
        missingListingId: "XIVPF 모집에 ID가 없습니다",
        fetchHttp: ({ status }) => `XIVPF HTTP 오류: ${status}`,
      },
      invalidLanguage: ({ value, supported }) =>
        `지원하지 않는 LANGUAGE ${JSON.stringify(value)}입니다. EN을 사용합니다. 지원 언어: ${supported.join(", ")}.`,
    },
    common: {
      unknown: "알 수 없음",
      unlimited: "제한 없음",
      listSeparator: ", ",
      now: "지금",
    },
    embed: {
      description: "📃 소개말",
      category: "🎯 모집 분류",
      server: "🌍 서버",
      creator: "👤 모집자",
      minIlvl: "⚔️ 최소 평균 아이템 레벨",
      expires: "⏳ 모집 마감",
      party: ({ current, total }) => `👨‍👩‍👧‍👦 파티 (${current}/${total})`,
    },
    commands: {
      subscribe: "현재 채널의 파티 모집 알림 구독",
      list: "현재 채널의 모집 구독 목록 보기",
      edit: "현재 채널의 모집 구독 선택 및 수정",
      unsubscribe: "현재 채널의 모집 구독 선택 및 취소",
      clear: "현재 채널의 종료된 모집 메시지와 전송 기록 삭제",
      reset: "선택한 구독 또는 모든 구독의 메시지와 전송 기록 강제 삭제",
      page: "페이지 번호, 기본값 1",
    },
    filters: ({ centres, categories }) =>
      `데이터 센터: ${centres}\n모집 분류: ${categories}`,
    form: {
      createTitle: "모집 구독 생성",
      editTitle: "모집 구독 수정",
      pattern: "정규 표현식",
      patternDescription:
        "영문 임무 이름과 소개말 원문을 정규 표현식으로 검색합니다. RE2 문법, 1–1000자.",
      dataCentres: "데이터 센터",
      categories: "모집 분류",
      multiSelect: "다중 선택 가능, 비워 두면 제한 없음",
      createTimeout: "ℹ️ 시간이 초과되어 구독이 생성되지 않았습니다.",
      editTimeout: "ℹ️ 시간이 초과되어 변경 사항이 저장되지 않았습니다.",
      created: ({ pattern, filters, id }) =>
        `✅ 현재 채널에 모집 구독을 생성했습니다.\n정규 표현식: ${pattern}\n${filters}\nID: ${id}`,
      edited: ({ pattern, filters, id }) =>
        `✅ 현재 채널의 모집 구독을 수정했습니다.\n정규 표현식: ${pattern}\n${filters}\nID: ${id}`,
    },
    pager: {
      empty: "ℹ️ 현재 채널에 모집 구독이 없습니다.",
      summary: ({ total, page, pageCount }) =>
        `📋 **현재 채널의 모집 구독** (${total}개) | ${page}/${pageCount} 페이지`,
      item: ({ index, pattern, filters, id, userId }) =>
        `\n\n${index}. ${pattern}\n${filters}\nID: ${id} | 생성자: <@${userId}>`,
      selectEdit: "\n수정할 모집 구독을 선택하세요:",
      selectDelete: "\n취소할 모집 구독을 선택하세요:",
      selectReset:
        "\n메시지와 전송 기록을 강제 삭제할 구독을 선택하세요. 진행 중인 모집도 삭제합니다. 구독 설정은 유지되며 유효한 모집은 다음 확인 때 다시 전송될 수 있습니다. 여러 구독이 공유하는 메시지도 삭제됩니다.",
      placeholder: "현재 페이지의 모집 구독 선택",
      emptyPattern: "(빈 정규 표현식)",
      all: "모든 구독",
      allDescription:
        "취소된 구독의 기록을 포함하여 모든 모집 메시지와 전송 기록 강제 삭제",
      previous: "이전",
      next: "다음",
      resetting: "⏳ 강제 삭제 중…",
      editOpened:
        "ℹ️ 양식에서 정규 표현식, 데이터 센터, 모집 분류를 수정하고 제출하여 저장하세요.",
      cancelled: "✅ 모집 구독을 취소했습니다.",
    },
    errors: {
      PATTERN_LENGTH: "정규 표현식은 1–1000자여야 합니다",
      INVALID_PATTERN: "유효하지 않은 RE2 정규 표현식",
      INVALID_DATA_CENTRE: "유효하지 않은 데이터 센터",
      INVALID_CATEGORY: "유효하지 않은 모집 분류",
      DUPLICATE_SUBSCRIPTION:
        "현재 채널에 같은 정규 표현식과 필터의 모집 구독이 이미 있습니다",
      SUBSCRIPTION_NOT_FOUND:
        "모집 구독을 찾을 수 없거나 접근 권한이 없습니다.",
      guildOnly: "서버 채널에서 이 명령을 사용하세요.",
      channelOnly: "텍스트 채널, 공지 채널 또는 스레드만 지원합니다.",
      userPermissions: "현재 채널의 채널 보기 및 채널 관리 권한이 필요합니다.",
      threadClosed: "스레드가 보관되었거나 잠겨 있습니다. 먼저 복원하세요.",
      botPermissions:
        "봇에 채널 보기, 메시지 보내기 및 링크 임베드 권한이 필요합니다.",
      botTimedOut: "봇이 타임아웃 상태입니다. 먼저 해제하세요.",
      privateThread:
        "봇이 비공개 스레드에 접근할 수 없습니다. 봇을 추가하고 권한을 확인하세요.",
      commandFailed: "❌ 명령 실행 실패",
    },
    cleanup: {
      result: ({ removed, failed }) =>
        `메시지 및 전송 기록 ${removed}개를 삭제했습니다. 실패 ${failed}개는 재시도를 위해 기록을 유지합니다. 구독 설정은 유지되었습니다.`,
      fetchFailed:
        "\n모집 정보 가져오기에 실패하여 저장된 만료 시간만으로 정리했습니다.",
      unlinked: ({ count }) =>
        `\n구독과 연결되지 않은 이전 기록 ${count}개가 있습니다. '모든 구독'을 선택하여 삭제하세요.`,
    },
    presence: {
      fetching: "파티 모집 정보 가져오기 및 처리 중…",
      clearing: "종료된 파티 모집 정리 중…",
      noNextTime: "예정된 실행 없음",
      next: ({ time }) => `다음 실행: ${time}`,
    },
  },
} satisfies Locale;
