// 画面遷移とイベント処理の起点

import { STAGES, FORMATIONS, BALANCE } from "./masterData.js?v=1785558404241";
import {
  createGameState,
  applyBattleResult,
  advanceDay,
  saveGameState,
  loadGameState,
  clearSavedGameState,
  declareLastDance,
  resolvePressConference,
  finalizeContractRenewal,
  renegotiateSalary,
  fireIdol,
  exportSaveJson,
  parseSaveJson,
  runTrialPerformance,
} from "./state.js?v=1785558404241";
import { createBattleState, primeTelegraph, resolveTurn, retreat as retreatBattle, applyCheerBoost } from "./battle.js?v=1785558404241";
import { getAvailableStages } from "./jobBoard.js?v=1785558404241";
import {
  hireStaff,
  fireStaff,
  takeBankLoan,
  takePatronInvestment,
  purchaseFacility,
  purchaseEquipment,
  startVenture,
  cancelVenture,
} from "./office.js?v=1785558404241";
import { formUnit, disbandUnit, addUnitMember, removeUnitMember } from "./units.js?v=1785558404241";
import {
  renderHome,
  renderTalentList,
  renderTaskBoard,
  renderUnitEditor,
  renderStageSelect,
  renderPressConference,
  renderStart,
  renderBankruptcy,
  drawQueuedPortraits,
} from "./ui.js?v=1785558404241";
import { mountLoadoutView } from "./loadout.js?v=1785558404241";
import { mountBattleView } from "./battleView.js?v=1785558404241";
import { mountScoutView } from "./scoutView.js?v=1785558404241";
import { mountTrainingView } from "./trainingView.js?v=1785558404241";
import { mountIdolDetailView } from "./idolDetailView.js?v=1785558404241";
import { mountContractRenewalView } from "./contractRenewalView.js?v=1785558404241";
import { scoutLeadsPinsHtml } from "./scoutLeadCard.js?v=1785558404241";
import { renderGuideHtml } from "./guideView.js?v=1785558404241";
import { morph } from "./domMorph.js?v=1785558404241";

const app = document.getElementById("app");

let gameState = null;
let selectedStage = null;
let selectedIdolId = null;
let selectedLeadId = null;
let battleState = null;
let battleController = null;
// お試しステージ実施中のバトルなら { leadId } を持つ(§お試しステージ実行で
// バトル画面が始まるように)。null なら通常の仕事バトル。
let pendingScoutTrial = null;
// 'start' | 'home' | 'talentList' | 'stageSelect' | 'scout' | 'training' |
// 'idolDetail' | 'loadout' | 'battle' | 'pressConference'
let screen = "start";
let previousScreen = null;

// 開いているモーダルのid(1画面につき同時に1つだけ)を保持する。画面遷移するたびリセットする。
let openModal = null;
// ホーム画面下部ナビ(§UI再設計Attempt2)。タレント/事務所/ランキングのどれを
// 展開中か(nullなら全部たたんだ状態)。画面遷移するたびリセットする。
let expandedCategory = null;

function goHome() {
  // 記者会見(§8)・契約更改(§スカウト充実化)が保留中の間は、解決するまでホームへ戻さない
  // (記者会見の方を優先する)
  if (gameState.pendingPressConference) {
    screen = "pressConference";
  } else if (gameState.pendingContractRenewals?.length > 0) {
    screen = "contractRenewal";
  } else {
    screen = "home";
  }
}

// §UI改修計画⑤: 編成済みオファー(gameState.pendingBattles)を1件ずつバトル画面へ
// 誘導して手動プレイさせる。次の週へ進むのは、すべて消化してからadvanceDay()で行う。
function startNextPendingBattle() {
  const next = gameState.pendingBattles.shift();
  const stage = STAGES.find((s) => s.id === next.stageId);
  const formation = FORMATIONS[stage.formationId];
  battleState = createBattleState(
    gameState.roster,
    stage,
    next.assignment,
    gameState.songCount,
    gameState.masteredSongCount,
    gameState.era
  );
  primeTelegraph(battleState);
  screen = "battle";
}

// 「次の週へ」の実処理。編成済みオファーが残っていればまずそれを消化し、
// すべて終わってから週送り(レッスン→タスク→財務決算等)を実行する。
function proceedWeekAdvance() {
  if (gameState.pendingBattles.length > 0) {
    startNextPendingBattle();
  } else {
    advanceDay(gameState);
    saveGameState(gameState);
    goHome();
  }
}

// セーブデータのエクスポート/インポート(§13)。<input type="file">は#appの外側に
// 常設し、render()での innerHTML 差し替えで消えないようにする。
const importFileInput = document.createElement("input");
importFileInput.type = "file";
importFileInput.accept = "application/json";
importFileInput.hidden = true;
document.body.appendChild(importFileInput);

function triggerExport(state) {
  const json = exportSaveJson(state);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `idolgen-save-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

importFileInput.addEventListener("change", () => {
  const file = importFileInput.files?.[0];
  importFileInput.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const parsed = parseSaveJson(String(reader.result));
    if (!parsed) {
      window.alert("セーブデータの読み込みに失敗しました(ファイル形式を確認してください)");
      return;
    }
    gameState = parsed;
    saveGameState(gameState);
    openModal = null;
    goHome();
    render();
  };
  reader.readAsText(file);
});

function render() {
  // 倒産(§8): bankruptフラグが立ったら、どの画面にいてもゲームオーバーへ
  // 強制遷移する(セーブは「続ける」を出さないよう倒産確定時に一度だけ消す)。
  if (gameState?.bankrupt && screen !== "gameOver") {
    screen = "gameOver";
    clearSavedGameState();
  }

  // 画面が実際に切り替わったときだけモーダルの状態をリセットする
  // (同じ画面内でのモーダル開閉の再描画では状態を保持したいため)。
  if (screen !== previousScreen) {
    openModal = null;
    expandedCategory = null;
    previousScreen = screen;
  }
  const uiState = { openModal, expandedCategory };

  if (screen === "start") {
    morph(app, renderStart(!!loadGameState()));
  } else if (screen === "guide") {
    morph(app, renderGuideHtml());
  } else if (screen === "gameOver") {
    morph(app, renderBankruptcy(gameState));
  } else if (screen === "home") {
    morph(
      app,
      renderHome(gameState, getAvailableStages(gameState, STAGES), uiState, scoutLeadsPinsHtml(gameState))
    );
  } else if (screen === "talentList") {
    morph(app, renderTalentList(gameState, uiState));
  } else if (screen === "taskBoard") {
    morph(app, renderTaskBoard(gameState));
  } else if (screen === "unitEditor") {
    morph(app, renderUnitEditor(gameState));
  } else if (screen === "pressConference") {
    morph(app, renderPressConference(gameState));
  } else if (screen === "contractRenewal") {
    const renewalIdolId = gameState.pendingContractRenewals[0];
    mountContractRenewalView(app, gameState, renewalIdolId, {
      onResolve: (outcome) => {
        finalizeContractRenewal(gameState, renewalIdolId, outcome);
        saveGameState(gameState);
      },
      onGone: () => {
        goHome();
        render();
      },
    });
  } else if (screen === "stageSelect") {
    morph(app, renderStageSelect(gameState, getAvailableStages(gameState, STAGES), uiState));
  } else if (screen === "scout") {
    // §UI改修計画⑦: 「スカウト」メニューの中で「行き先へ出向く」「公募をかける」
    // という別行動を選ばせる(モード選択はscoutView.js内部で管理する)。
    mountScoutView(
      app,
      gameState,
      {
        onBack: () => {
          goHome();
          render();
        },
        onBankrupt: () => {
          screen = "gameOver";
          render();
        },
        onGateEvent: () => {
          goHome();
          render();
        },
        onStartTrial: (newBattleState, leadId) => {
          // お試しステージ実行時にバトル画面を始める(§お試しステージ実行で
          // バトル画面が始まるように)。battleState/screenはmain.js側で持つため
          // scoutView.jsからはコールバック経由で受け渡す。
          battleState = newBattleState;
          pendingScoutTrial = { leadId };
          screen = "battle";
          render();
        },
      },
      selectedLeadId
    );
    selectedLeadId = null;
  } else if (screen === "training") {
    mountTrainingView(app, gameState, {
      onBack: () => {
        goHome();
        render();
      },
      onChange: () => {
        saveGameState(gameState);
      },
    });
  } else if (screen === "idolDetail") {
    mountIdolDetailView(app, gameState, selectedIdolId, {
      onBack: () => {
        selectedIdolId = null;
        screen = "talentList";
        render();
      },
      onDeclareLastDance: (idolId) => {
        // idolDetailViewが自前でrender()するため、ここでの画面全体render()は呼ばない
        // (screenが変わらないのに呼ぶとmountIdolDetailViewが再実行され、
        // クリックリスナーが二重登録されてしまう)。
        declareLastDance(gameState, idolId);
        saveGameState(gameState);
      },
      onNegotiateSalary: (idolId, newSalaryType) => {
        const result = renegotiateSalary(gameState, idolId, newSalaryType);
        saveGameState(gameState);
        return result;
      },
      onFireIdol: (idolId) => {
        fireIdol(gameState, idolId);
        saveGameState(gameState);
        selectedIdolId = null;
        screen = "talentList";
        render();
      },
    });
  } else if (screen === "loadout") {
    const formation = FORMATIONS[selectedStage.formationId];
    mountLoadoutView(app, gameState, selectedStage, formation, {
      onBack: () => {
        screen = "stageSelect";
        render();
      },
      onStart: (assignment) => {
        // §UI改修計画⑤: 編成完了後、即座にバトルへは向かわず一覧へ戻る。
        // 実際の対戦は週送り(次の週へ)のタイミングでまとめて行う(pendingBattles)。
        gameState.pendingBattles = gameState.pendingBattles.filter((b) => b.stageId !== selectedStage.id);
        gameState.pendingBattles.push({ stageId: selectedStage.id, assignment });
        saveGameState(gameState);
        selectedStage = null;
        screen = "stageSelect";
        render();
      },
    });
  } else if (screen === "battle") {
    battleController = mountBattleView(app, gameState, battleState, {
      onTurn: (advance) => {
        const events = resolveTurn(battleState, { advance });
        battleController.playEvents(events);
      },
      onRetreat: () => {
        const events = retreatBattle(battleState);
        battleController.playEvents(events);
      },
      onCheerBoost: () => {
        // 応援ブースト(§10): 現金消費の経営判断。課金要素ではない
        if (gameState.cash < BALANCE.cheerBoost.cost) return null;
        const ev = applyCheerBoost(battleState);
        if (!ev) return null;
        gameState.cash -= BALANCE.cheerBoost.cost;
        saveGameState(gameState);
        return ev;
      },
      onFinish: () => {
        if (pendingScoutTrial) {
          // お試しステージのバトルは仕事バトルとは別物(報酬・記者会見・週送りには
          // 一切関与しない)。勝敗にかかわらず選択済み項目の開示・費用精算だけ行い、
          // そのままアイドル表示ステップへ戻る(§お試しステージ実行でバトル画面が始まるように)。
          const { leadId } = pendingScoutTrial;
          pendingScoutTrial = null;
          runTrialPerformance(gameState, leadId);
          saveGameState(gameState);
          battleState = null;
          battleController = null;
          selectedLeadId = leadId;
          screen = "scout";
          render();
          return;
        }
        applyBattleResult(gameState, battleState);
        saveGameState(gameState);
        battleState = null;
        battleController = null;
        selectedStage = null;
        if (gameState.pendingPressConference || gameState.pendingContractRenewals?.length > 0) {
          // 記者会見/契約更改を優先して解決させる。残りのpendingBattlesは
          // 次に「次の週へ」を押したときに続けて消化される。
          goHome();
        } else {
          // §UI改修計画⑤: 編成済みオファーが他にも残っていれば続けて手動プレイへ誘導し、
          // すべて消化してから通常の週送り(advanceDay)を行う。
          proceedWeekAdvance();
        }
        render();
      },
    });
  }
  // 顔アイコン(§12.1)。home/office/pressConference/contractRenewal/stageSelectは
  // ここでcontainer.innerHTMLを直接差し替えるだけの単純描画のため、ポートレートの
  // 実描画(canvasはDOM挿入後でないと描けない)をまとめてこの1箇所で行う。
  // loadout/battle/scout/training/idolDetailは専用コントローラが自分のrender()内で
  // 個別に呼んでいる。
  drawQueuedPortraits();
}

// loadout / battle / scout / training / idolDetail / contractRenewal 画面は
// 専用コントローラがDOMを直接更新するため、ここでの委譲は home / stageSelect の
// 画面遷移用アクションのみを扱う。
app.addEventListener("click", (event) => {
  if (["loadout", "battle", "scout", "training", "idolDetail", "contractRenewal"].includes(screen)) return;

  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  switch (action) {
    case "new-game":
      gameState = createGameState();
      saveGameState(gameState);
      goHome();
      break;

    case "continue-game": {
      const loaded = loadGameState();
      if (!loaded) break;
      gameState = loaded;
      goHome();
      break;
    }

    case "go-to-guide":
      screen = "guide";
      break;

    case "guide-back":
      screen = "start";
      break;

    case "go-to-work":
      screen = "stageSelect";
      break;

    case "go-to-talent-list":
      screen = "talentList";
      break;

    case "go-to-task-board":
      screen = "taskBoard";
      break;

    case "go-to-unit-editor":
      screen = "unitEditor";
      break;

    case "toggle-category":
      expandedCategory = expandedCategory === target.dataset.category ? null : target.dataset.category;
      break;

    case "go-to-scout":
      screen = "scout";
      break;

    case "go-to-training":
      screen = "training";
      break;


    case "hire-staff":
      hireStaff(gameState, target.dataset.staff);
      saveGameState(gameState);
      break;

    case "fire-staff":
      fireStaff(gameState, target.dataset.staff);
      saveGameState(gameState);
      break;

    case "take-bank-loan":
      takeBankLoan(gameState);
      saveGameState(gameState);
      break;

    case "take-patron":
      takePatronInvestment(gameState);
      saveGameState(gameState);
      break;

    case "purchase-facility":
      purchaseFacility(gameState, target.dataset.facility);
      saveGameState(gameState);
      break;

    case "purchase-equipment":
      purchaseEquipment(gameState, target.dataset.equipment);
      saveGameState(gameState);
      break;

    case "start-venture":
      startVenture(gameState, target.dataset.venture);
      saveGameState(gameState);
      break;

    case "cancel-venture":
      cancelVenture(gameState, target.dataset.venture);
      saveGameState(gameState);
      break;

    case "form-unit": {
      const nameInput = document.getElementById("unit-name-input");
      const memberIds = [...document.querySelectorAll(".unit-member-checkbox:checked")].map((el) => el.value);
      formUnit(gameState, nameInput?.value ?? "", memberIds);
      saveGameState(gameState);
      break;
    }

    case "disband-unit":
      disbandUnit(gameState, target.dataset.unit);
      saveGameState(gameState);
      break;

    case "join-unit": {
      const select = document.getElementById(`join-select-${target.dataset.unit}`);
      if (select?.value) addUnitMember(gameState, target.dataset.unit, select.value);
      saveGameState(gameState);
      break;
    }

    case "leave-unit":
      removeUnitMember(gameState, target.dataset.unit, target.dataset.idol);
      saveGameState(gameState);
      break;

    case "press-cover-up":
      resolvePressConference(gameState, "coverUp");
      saveGameState(gameState);
      goHome();
      break;

    case "press-apology":
      resolvePressConference(gameState, "apology");
      saveGameState(gameState);
      goHome();
      break;

    case "press-denial":
      resolvePressConference(gameState, "denial");
      saveGameState(gameState);
      goHome();
      break;

    case "press-tail-cutting":
      resolvePressConference(gameState, "tailCutting");
      saveGameState(gameState);
      goHome();
      break;

    case "view-idol":
      selectedIdolId = target.dataset.idol;
      screen = "idolDetail";
      break;

    case "view-lead":
      // ホーム画面の地図ピン(§ホーム画面の地図ピンをスカウト画面と共有化)。
      // 別モーダルは開かず、スカウト画面のウィザードへその候補を選んだ状態で入る。
      selectedLeadId = target.dataset.lead;
      screen = "scout";
      break;

    case "back-home":
      goHome();
      break;

    case "open-modal":
      openModal = target.dataset.modal;
      break;

    case "close-modal":
      openModal = null;
      break;

    case "back-to-title":
      // 進行状況は各アクション後に自動セーブ済みなので、そのままタイトルへ戻るだけでよい
      gameState = null;
      openModal = null;
      screen = "start";
      break;

    case "start-battle": {
      selectedStage = STAGES.find((s) => s.id === target.dataset.stage);
      screen = "loadout";
      break;
    }

    case "next-day":
      // §UI改修計画⑤: 編成済みオファーがあれば先にバトルへ誘導し(手動プレイ)、
      // すべて消化してから通常の週送り処理(レッスン→タスク→財務決算等)を行う。
      proceedWeekAdvance();
      break;

    case "export-save":
      if (gameState) triggerExport(gameState);
      break;

    case "import-save":
      importFileInput.click();
      break;

  }

  render();
});

// タスク画面(§UI改修計画④)のグループ/個人へのタスク割り当ては<select>の
// changeイベントで受け取る(clickデリゲータでは拾えないため専用に用意する)。
app.addEventListener("change", (event) => {
  if (["loadout", "battle", "scout", "training", "idolDetail", "contractRenewal"].includes(screen)) return;
  const target = event.target.closest("[data-action]");
  if (!target) return;

  if (target.dataset.action === "set-group-task") {
    gameState.pendingTasks ??= { groups: {}, individuals: {} };
    if (target.value) gameState.pendingTasks.groups[target.dataset.unit] = target.value;
    else delete gameState.pendingTasks.groups[target.dataset.unit];
    saveGameState(gameState);
    render();
  } else if (target.dataset.action === "set-individual-task") {
    gameState.pendingTasks ??= { groups: {}, individuals: {} };
    if (target.value) gameState.pendingTasks.individuals[target.dataset.idol] = target.value;
    else delete gameState.pendingTasks.individuals[target.dataset.idol];
    saveGameState(gameState);
    render();
  }
});

render();
