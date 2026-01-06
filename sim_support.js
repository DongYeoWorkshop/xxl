// sim_support.js
import { charData } from './data.js';
import { getDefaultActionPattern } from './simulator-common.js';
import { state, constants } from './state.js';
import { getSkillValue } from './sim_ctx.js';
import { getSkillMultiplier } from './formatter.js';
import { simParams } from './sim_params.js';
import { calculateBaseStats } from './calculations.js';

/**
 * [핵심 헬퍼] 서포터의 상태(sState)에 타이머/스택 추가 및 갱신
 */
function supportAddTimer(sState, key, dur, maxStacks = 1) {
    if (maxStacks <= 1) {
        // 단일 타이머: 단순히 덮어씌움 (갱신)
        sState[key] = dur;
    } else {
        // 중첩형 타이머 (배열)
        if (!sState[key]) sState[key] = [];
        if (!Array.isArray(sState[key])) sState[key] = []; // 안전장치

        if (sState[key].length < maxStacks) {
            sState[key].push(dur);
        } else {
            // 최대 중첩 시 가장 짧은 남은 시간을 찾아 갱신
            let minIdx = 0;
            let minVal = Infinity;
            sState[key].forEach((v, idx) => {
                if (v < minVal) {
                    minVal = v;
                    minIdx = idx;
                }
            });
            sState[key][minIdx] = dur;
        }
    }
}

/**
 * [핵심 헬퍼] 서포터의 스킬 수치를 동적으로 계산
 */
function getSupportVal(charId, skillIdx, effectKey, targetCharData = null, isStamp = false) {
    const data = charData[charId];
    if (!data) return 0;
    const stats = state.savedStats[charId] || { lv: 1, s1: 0, s2: 0, skills: {} };
    if (targetCharData && targetCharData.info) {
        const originalInfo = data.info;
        const tempInfo = { ...data.info, 속성: targetCharData.info.속성 };
        data.info = tempInfo;
        const val = getSkillValue(data, stats, skillIdx, effectKey, isStamp);
        data.info = originalInfo;
        return val;
    }
    return getSkillValue(data, stats, skillIdx, effectKey, isStamp);
}

/**
 * [핵심 헬퍼] 서포터의 버프/디버프 가중치 계산
 */
function getWeightedSupportVal(ctx, supportId, skillIdx, effectKey, targetCharData, isMultiParam = false) {
    const val = getSupportVal(supportId, skillIdx, effectKey, targetCharData);
    if (val === 0) return 0;
    const supportSkill = charData[supportId].skills[skillIdx];
    const isAOESkill = supportSkill?.isMultiTarget || isMultiParam;
    if (effectKey.includes("디버프") || effectKey === "추가데미지") {
        if (ctx.isMulti && !isAOESkill && ctx.targetCount > 1) return val / ctx.targetCount;
    }
    return val;
}

/**
 * [핵심 헬퍼] sim_params의 설정을 읽어와서 확률적으로 버프 타이머 작동 및 로그 기록
 */
function tryApplySupportParam(ctx, sState, param, stateKey) {
    if (!param) return false;
    const supportStats = state.savedStats[ctx.supportId] || { skills: {} };
    const supportData = charData[ctx.supportId];
    const sIdx = supportData.skills.findIndex(s => s.id === param.originalId);
    let finalProb = param.prob !== undefined ? param.prob : 1.0;
    if (sIdx !== -1 && (param.scaleProb || param.startRate !== undefined)) {
        const skill = supportData.skills[sIdx];
        let targetIdx = sIdx;
        
        // [추가] 레벨 연동(syncLevelWith) 처리
        if (skill.syncLevelWith) {
            const parentIdx = supportData.skills.findIndex(s => s.id === skill.syncLevelWith);
            if (parentIdx !== -1) targetIdx = parentIdx;
        }

        const sLv = parseInt(supportStats.skills?.[`s${targetIdx + 1}`] || 1);
        const rate = getSkillMultiplier(sLv, param.startRate || skill.startRate || 0.6);
        finalProb *= rate;
    }
    if (Math.random() < finalProb) {
        const timerKey = stateKey;
        let finalDur = param.duration || 1;
        const maxStacks = param.maxStacks || 1;
        
        // [추가] 피격 타이밍(본인 또는 아군)에 걸리는 버프는 지속시간 +1 보정
        if (param.triggers?.includes("being_hit") || param.triggers?.includes("ally_hit")) {
            finalDur += 1;
        }
        
        supportAddTimer(sState, timerKey, finalDur, maxStacks);

        if (sIdx !== -1) {
            let skill = supportData.skills[sIdx], isStamp = (param.customTag === "도장"), targetSIdx = sIdx;
            if (ctx.supportId === 'beernox' && isStamp) { targetSIdx = 1; skill = supportData.skills[1]; isStamp = false; }

            // [수정] param.valKey가 있으면 우선 사용, 없으면 자동 탐색
            const effectKey = (param.valKey !== undefined) ? param.valKey : (() => {
                const effects = isStamp ? (skill.stampBuffEffects || {}) : (skill.buffEffects || {});
                let key = Object.keys(effects)[0];
                if (!key && skill.ratioEffects) key = Object.keys(skill.ratioEffects)[0];
                return key || "공증";
            })();

            const val = getSupportVal(ctx.supportId, targetSIdx, effectKey, ctx.charData, isStamp);
            
            // [수정] 가산 수치(+XXXX) 계산 로직: 현재 서포터의 모든 기초공증 효과를 합산
            let boostText = "";
            if (param.showAtkBoost || skill.ratioEffects) {
                const sLv = parseInt(supportStats.lv || 1), sBr = parseInt(supportStats.s1 || 0), sFit = parseInt(supportStats.s2 || 0);
                const baseAtkRaw = supportData.base["공격력"] * Math.pow(1.05, sLv - 1);
                const brBonus = 1 + (sBr * 0.02), fitBonus = 1 + (sFit * 0.04);
                
                // 실시간 모든 기초공증 효과 수집
                let baseAtkBoostRate = 0;
                supportData.skills.forEach((s, idx) => {
                    if (s.buffEffects && s.buffEffects["기초공증"]) {
                        // 해금 조건 체크
                        const thresholds = [0, 0, 0, 0, 30, 50, 75]; 
                        if (idx >= 4 && idx <= 6 && sBr < thresholds[idx]) return;

                        // 타이머 또는 스택 키 찾기
                        const shortId = s.id.split('_').pop();
                        const keysToCheck = [
                            s.id + "_stacks", shortId + "_stacks", 
                            s.id + "_stackses", shortId + "_stackses",
                            s.id + "_timer", shortId + "_timer", 
                            s.id + "_timers", shortId + "_timers",
                            s.id, shortId
                        ];
                        const foundKey = keysToCheck.find(k => sState[k] !== undefined);
                        const stateVal = foundKey ? sState[foundKey] : undefined;
                        
                        if (stateVal || (idx >= 2 && idx <= 6 && !s.hasCounter && !s.hasToggle)) { // 상시 패시브 혹은 활성화된 버프
                            const sVal = getSupportVal(ctx.supportId, idx, '기초공증');
                            let count = 0;
                            if (Array.isArray(stateVal)) {
                                count = stateVal.length;
                            } else if (typeof stateVal === 'number' && stateVal > 0) {
                                // 스택형이거나 카운터형인 경우만 중첩수 적용, 타이머는 1로 고정
                                const isStackType = (foundKey && foundKey.includes('stacks')) || s.hasCounter;
                                count = isStackType ? stateVal : 1;
                            } else if (!stateVal && idx >= 2 && idx <= 6) {
                                // 상시 패시브 (Skill 6 등)
                                count = 1;
                            }
                            
                            if (count > 0) baseAtkBoostRate += (sVal * count);
                        }
                    }
                });

                const currentBaseAtk = baseAtkRaw * brBonus * fitBonus * (1 + baseAtkBoostRate / 100);
                const boostVal = Math.floor(currentBaseAtk * (val / 100));
                boostText = ` (+${boostVal.toLocaleString()} 가산)`;
            }
            // [수정] 확률 로그 및 변수 정의
            const displayProb = (finalProb < 1.0) ? Math.floor(finalProb * 100) : null;
            
            // [수정] 상세 로그 형식을 서포터 전용으로 최적화
            const logIdx = { 
                name: "", // ctx.log의 두번째 인자를 전체 메시지로 사용
                icon: `images/${ctx.supportId}.webp`
            };
            
            // "파미도: [패시브2] 공격력 가산" 형식으로 메시지 구성
            const skillTag = param.customTag ? `[${param.customTag}] ` : "";
            const supportMsg = `${supportData.title}: ${skillTag}${param.label || skill.name}${boostText}`;
            
            ctx.log(logIdx, supportMsg, displayProb, finalDur, !!param.skipLog, "서포터");
        }
        return true;
    }
    return false;
}

/**
 * [헬퍼] 서포터의 행동 패턴을 가져옴 (행동 수정 탭 데이터 우선)
 */
function getSupportAction(charId, turn) {
    try {
        const savedPattern = JSON.parse(localStorage.getItem(`sim_pattern_${charId}`));
        if (savedPattern && savedPattern[turn - 1]) return savedPattern[turn - 1];
    } catch (e) {}
    return getDefaultActionPattern(charId, turn);
}

export const supportLogic = {
    "khafka": {
        getInitialState: () => ({ passive2_timer: 0, passive3_timer: 0, passive5_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.khafka; ctx.supportId = 'khafka';
            if (sState.passive2_timer > 0) sState.passive2_timer--;
            if (sState.passive3_timer > 0) sState.passive3_timer--;
            if (sState.passive5_timer > 0) sState.passive5_timer--;
            let actionType = getSupportAction('khafka', ctx.t);
            const logIdx = { name: "", icon: "images/khafka.webp" };
            if (actionType === 'ult') {
                ctx.log(logIdx, "카푸카: [필살기] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill7_buff, 'passive5_timer');
                tryApplySupportParam(ctx, sState, p.skill4_buff, 'passive2_timer');
            } else if (actionType === 'defend') {
                ctx.log(logIdx, "카푸카: [방어]", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill5_buff, 'passive3_timer');
            } else {
                ctx.log(logIdx, "카푸카: [보통공격] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill4_buff, 'passive2_timer');
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "뎀증디버프": 0, "공증": 0 };
            bonuses["공증"] += getSupportVal('khafka', 2, '공증', targetCharData);
            if (sState.passive2_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'khafka', 3, '뎀증디버프', targetCharData);
            if (sState.passive3_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'khafka', 4, '뎀증디버프', targetCharData);
            if (sState.passive5_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'khafka', 6, '뎀증디버프', targetCharData);
            return bonuses;
        }
    },
    "anuberus": {
        getInitialState: () => ({ dog_black_timer: 0, dog_white_timer: 0, vuln_timers: [] }),
        onTurn: (ctx, sState) => {
            const p = simParams.anuberus; ctx.supportId = 'anuberus';
            if (sState.dog_black_timer > 0) sState.dog_black_timer--;
            if (sState.dog_white_timer > 0) sState.dog_white_timer--;
            sState.vuln_timers = (sState.vuln_timers || []).map(t => t - 1).filter(t => t > 0);
            let actionType = getSupportAction('anuberus', ctx.t);
            const logIdx = { name: "", icon: "images/anuberus.webp" };
            if (actionType !== 'defend') {
                if (actionType === 'ult') ctx.log(logIdx, "아누비로스: [필살기] 사용", null, null, false, "서포터");
                else ctx.log(logIdx, "아누비로스: [보통공격] 사용", null, null, false, "서포터");
                const activeDogs = (sState.dog_black_timer > 0 ? 1 : 0) + (sState.dog_white_timer > 0 ? 1 : 0);
                if (activeDogs > 0) {
                    for (let k = 0; k < activeDogs; k++) {
                        supportAddTimer(sState, 'vuln_timers', 3, 4);
                    }
                    // [수정] 아이콘 주입
                    ctx.log({ name: "어둠속성 받뎀증", icon: "images/anuberus.webp" }, `부여 (현재 ${sState.vuln_timers.length}중첩)`, null, null, false, "서포터");
                }
                if (Math.random() < 0.5) { sState.dog_black_timer = 2; ctx.log(`ㄴ [패시브] 흑구 발동`); }
                if (Math.random() < 0.5) { sState.dog_white_timer = 2; ctx.log(`ㄴ [패시브] 백구 발동`); }
            } else ctx.log({ name: "", icon: "images/anuberus.webp" }, "아누비로스: [방어]", null, null, false, "서포터");
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "속성디버프": 0, "공증": 0 };
            bonuses["공증"] += getSupportVal('anuberus', 2, '공증', targetCharData);
            if (sState.vuln_timers.length > 0) bonuses["속성디버프"] += sState.vuln_timers.length * getWeightedSupportVal(ctx, 'anuberus', 3, '속성디버프', targetCharData);
            return bonuses;
        }
    },
    "rikano": {
        getInitialState: () => ({ passive1_timer: 0, passive2_timer: 0, passive8_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.rikano; ctx.supportId = 'rikano';
            if (sState.passive1_timer > 0) sState.passive1_timer--;
            if (sState.passive2_timer > 0) sState.passive2_timer--;
            if (sState.passive8_timer > 0) sState.passive8_timer--;
            let actionType = getSupportAction('rikano', ctx.t);
            const logIdx = { name: "", icon: "images/rikano.webp" };
            if (actionType === 'ult') {
                ctx.log(logIdx, "리카노: [필살기] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill2_debuff, 'passive2_timer');
                tryApplySupportParam(ctx, sState, p.skill8_debuff, 'passive8_timer');
            } else if (actionType === 'defend') ctx.log(logIdx, "리카노: [방어]", null, null, false, "서포터");
            else {
                ctx.log(logIdx, "리카노: [보통공격] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill1_debuff, 'passive1_timer');
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "뎀증디버프": 0, "공증": 0, "필살기뎀증": 0 };
            bonuses["공증"] += getSupportVal('rikano', 2, '공증', targetCharData);
            bonuses["필살기뎀증"] += getSupportVal('rikano', 3, '필살기뎀증', targetCharData);
            if (sState.passive1_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'rikano', 0, '뎀증디버프', targetCharData);
            if (sState.passive2_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'rikano', 1, '뎀증디버프', targetCharData);
            if (sState.passive8_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'rikano', 7, '뎀증디버프', targetCharData);
            return bonuses;
        }
    },
    "orem": {
        getInitialState: () => ({ shield_timer: 0 }),
        onTurn: (ctx, sState) => {
            ctx.supportId = 'orem';
            if (sState.shield_timer > 0) sState.shield_timer--;
            let actionType = getSupportAction('orem', ctx.t);
            if (actionType === 'ult') {
                sState.shield_timer = 2;
                ctx.log({ name: "아군 전체 [배리어]", icon: "images/orem.webp", label: "서포터", customTag: "오렘" }, "부여 (2턴)");
            }
            if (sState.shield_timer > 0) {
                if (!!(state.savedStats['orem']?.stamp)) {
                    ctx.log({ name: "현측 방어 전개", icon: "images/orem.webp", label: "도장", customTag: "서포터" }, "배리어 추가타 활성");
                }
            }
        },
        onEnemyHit: (ctx, sState) => {
            if (sState.shield_timer > 0) {
                const hitCount = parseInt(localStorage.getItem('sim_ctrl_orem_orem_hit_count') || 0);
                if (hitCount > 0) {
                    const reflectCoef = getSupportVal('orem', 6, '추가데미지');
                    for (let k = 0; k < hitCount; k++) {
                        ctx.log({ name: "충격 역류 (반사)", icon: "icon/passive5.webp", customTag: "서포터", coef: reflectCoef, type: "추가공격" }, "activate");
                        if (!ctx.extraHits) ctx.extraHits = [];
                        ctx.extraHits.push({ name: "오렘: 충격 역류", skillId: "orem_skill7", val: reflectCoef, type: "추가공격", customTag: "서포터", icon: "icon/passive5.webp" });
                    }
                }
            }
        },
        onAttack: (ctx, sState) => {
            if (sState.shield_timer > 0) {
                const oremStats = state.savedStats['orem'] || {};
                const isOremStamped = !!(oremStats.stamp);
                if (isOremStamped) {
                    const oremExtraCoef = 25;
                    if (!ctx.extraHits) ctx.extraHits = [];
                    ctx.extraHits.push({ name: "오렘 (배리어 추가타)", skillId: "orem_skill8", val: oremExtraCoef, type: "추가공격", customTag: "서포터", icon: "images/sigilwebp/sigil_orem.webp" });
                }
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "HP증가": 0 };
            bonuses["HP증가"] += getSupportVal('orem', 2, 'HP증가', targetCharData);
            return bonuses;
        }
    },
    "wang": {
        getInitialState: () => ({ skill2_timer: 0, skill5_timer: 0, skill5_stacks: 0 }),
        onTurn: (ctx, sState) => {
            ctx.supportId = 'wang';
            if (sState.skill2_timer > 0) sState.skill2_timer--;
            if (sState.skill5_timer > 0) { sState.skill5_timer--; if (sState.skill5_timer === 0) sState.skill5_stacks = 0; }
            let actionType = getSupportAction('wang', ctx.t);
            if (actionType === 'ult') {
                ctx.log({ name: "패란의 영감", icon: "images/wang.webp" }, "멍: [필살기] 사용", null, null, false, "서포터");
                sState.skill2_timer = 3;
                ctx.log({ name: "아군 전체 [영감]", icon: "images/wang.webp" }, "멍: 부여 (3턴)", null, null, false, "서포터");
            } else if (actionType === 'defend') ctx.log({ name: "", icon: "images/wang.webp" }, "멍: [방어]", null, null, false, "서포터");
            else ctx.log({ name: "", icon: "images/wang.webp" }, "멍: [보통공격] 사용", null, null, false, "서포터");
        },
        onEnemyHit: (ctx, sState) => {
            const savedProb = localStorage.getItem('sim_ctrl_wang_hit_prob');
            const hitProb = (savedProb !== null ? parseInt(savedProb) : 30) / 100;
            if (Math.random() < hitProb) {
                sState.skill5_stacks = Math.min(2, sState.skill5_stacks + 1);
                sState.skill5_timer = 3; // 피격 보정 적용 (2+1)
                
                // [수정] 지속시간 정보를 포함한 표준 로그 출력
                const logIdx = { name: `영감 공명 (${sState.skill5_stacks}중첩)`, icon: "images/wang.webp", customTag: "멍" };
                ctx.log(logIdx, `피격 발생 (뎀증 부여)`, null, 3);
            }
        },
        onAttack: (ctx, sState) => {
            if (!ctx.isUlt && sState.skill2_timer > 0) {
                const wangStats = state.savedStats['wang'] || {};
                const isWangStamped = !!(wangStats.stamp);
                const hitCoef = getSupportVal('wang', 1, '추가공격', ctx.charData, isWangStamped);
                if (!ctx.extraHits) ctx.extraHits = [];
                ctx.extraHits.push({ name: "멍: 패란의 영감 (협공)", skillId: "wang_skill2", val: hitCoef, type: "추가공격", customTag: "서포터", icon: "icon/attack(strong).webp" });
                if (isWangStamped && Math.random() < 0.5) {
                    ctx.extraHits.push({ name: "멍: 패란의 영감 (도장 협공)", skillId: "wang_skill2", val: hitCoef, type: "추가공격", customTag: "도장", icon: "images/sigilwebp/sigil_wang.webp" });
                }
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0, "평타뎀증": 0, "뎀증": 0 };
            bonuses["공증"] += getSupportVal('wang', 2, '공증', targetCharData);
            bonuses["공증"] += getSupportVal('wang', 6, '공증', targetCharData);
            bonuses["평타뎀증"] += getSupportVal('wang', 3, '평타뎀증', targetCharData);
            if (sState.skill5_stacks > 0) bonuses["뎀증"] += sState.skill5_stacks * getSupportVal('wang', 4, '뎀증', targetCharData);
            return bonuses;
        }
    },
    "tyrantino": {
        getInitialState: () => ({}),
        onTurn: (ctx, sState) => {
            ctx.supportId = 'tyrantino';
            let actionType = getSupportAction('tyrantino', ctx.t);
            const logIdx = { name: "", icon: "images/tyrantino.webp" };
            if (actionType === 'ult') ctx.log(logIdx, "타란디오: [필살기] 사용", null, null, false, "서포터");
            else if (actionType === 'defend') ctx.log(logIdx, "타란디오: [방어]", null, null, false, "서포터");
            else ctx.log(logIdx, "타란디오: [보통공격] 사용", null, null, false, "서포터");
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0 };
            bonuses["공증"] += getSupportVal('tyrantino', 2, '공증', targetCharData);
            return bonuses;
        }
    },
    "duncan": {
        getInitialState: () => ({ ult_timer: 0, normal_timer: 0, prob_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.duncan; ctx.supportId = 'duncan';
            if (sState.ult_timer > 0) sState.ult_timer--;
            if (sState.normal_timer > 0) sState.normal_timer--;
            if (sState.prob_timer > 0) sState.prob_timer--;
            let actionType = getSupportAction('duncan', ctx.t);
            const logIdx = { name: "", icon: "images/duncan.webp" };
            if (actionType === 'ult') {
                ctx.log(logIdx, "던컨 찰스: [필살기] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill2_buff, 'ult_timer');
            } else if (actionType === 'defend') ctx.log(logIdx, "던컨 찰스: [방어]", null, null, false, "서포터");
            else {
                ctx.log(logIdx, "던컨 찰스: [보통공격] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill4_buff, 'normal_timer');
                tryApplySupportParam(ctx, sState, p.skill9_buff, 'prob_timer');
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0 };
            bonuses["공증"] += getSupportVal('duncan', 2, '공증', targetCharData);
            if (sState.ult_timer > 0) bonuses["공증"] += getSupportVal('duncan', 1, '공증', targetCharData);
            if (sState.normal_timer > 0) bonuses["공증"] += getSupportVal('duncan', 3, '공증', targetCharData);
            if (sState.prob_timer > 0) bonuses["공증"] += getSupportVal('duncan', 8, '공증', targetCharData);
            return bonuses;
        }
    },
    "beernox": {
        getInitialState: () => ({ skill7_stacks: 0, skill1_timer: 0, skill2_timer: 0, skill2_stamp_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.beernox; ctx.supportId = 'beernox';
            if (sState.skill1_timer > 0) sState.skill1_timer--;
            if (sState.skill2_timer > 0) sState.skill2_timer--;
            if (sState.skill2_stamp_timer > 0) sState.skill2_stamp_timer--;
            if (ctx.t > 1 && sState.skill7_stacks < 15) sState.skill7_stacks++;
            const woodActive = localStorage.getItem('sim_ctrl_beernox_wood_party_active') === 'true';
            if (woodActive && ctx.t === 1) ctx.log({ name: "", icon: "images/beernox.webp" }, "비어녹스: ㄴ [패시브] 나무속성 파티원 조건 충족", null, null, false, "서포터");
            let actionType = getSupportAction('beernox', ctx.t);
            const logIdx = { name: "", icon: "images/beernox.webp" };
            if (actionType === 'ult') {
                ctx.log(logIdx, "비어녹스: [필살기] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill2_buff, 'skill2_timer');
                tryApplySupportParam(ctx, sState, p.skill2_stamp_buff, 'skill2_stamp_timer');
            } else if (actionType === 'defend') ctx.log(logIdx, "비어녹스: [방어]", null, null, false, "서포터");
            else {
                ctx.log(logIdx, "비어녹스: [보통공격] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill1_buff, 'skill1_timer');
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0, "고정공증": 0, "뎀증": 0 };
            bonuses["공증"] += getSupportVal('beernox', 2, '공증', targetCharData);
            if (localStorage.getItem('sim_ctrl_beernox_wood_party_active') === 'true') bonuses["뎀증"] += getSupportVal('beernox', 3, '뎀증', targetCharData);
            const supportStats = state.savedStats['beernox'] || { lv: 1, s1: 0, s2: 0 };
            const baseResult = calculateBaseStats(charData['beernox'].base, parseInt(supportStats.lv || 1), parseInt(supportStats.s1 || 0), parseInt(supportStats.s2 || 0), 1.05);
            let baseAtkBoostRate = 0;
            if (parseInt(supportStats.s1 || 0) >= 50) baseAtkBoostRate += getSupportVal('beernox', 5, '기초공증');
            if (sState.skill7_stacks) baseAtkBoostRate += sState.skill7_stacks * getSupportVal('beernox', 6, '기초공증');
            const currentBaseAtk = baseResult["공격력"] * (1 + baseAtkBoostRate / 100);
            if (sState.skill1_timer > 0) bonuses["고정공증"] += currentBaseAtk * (getSupportVal('beernox', 0, 0) / 100);
            if (sState.skill2_timer > 0) bonuses["고정공증"] += currentBaseAtk * (getSupportVal('beernox', 1, 0) / 100);
            if (sState.skill2_stamp_timer > 0) bonuses["고정공증"] += currentBaseAtk * (getSupportVal('beernox', 1, 0) / 100);
            return bonuses;
        }
    },
    "famido": {
        getInitialState: () => ({ tactical_stacks: 0, skill2_timer: 0, skill2_fixed_timer: 0, skill4_timer: 0, skill4_boost_timer: 0, skill5_timers: [] }),
        onTurn: (ctx, sState) => {
            const p = simParams.famido; ctx.supportId = 'famido';
            if (sState.skill2_timer > 0) sState.skill2_timer--;
            if (sState.skill2_fixed_timer > 0) sState.skill2_fixed_timer--;
            if (sState.skill4_timer > 0) sState.skill4_timer--;
            if (sState.skill4_boost_timer > 0) sState.skill4_boost_timer--;
            
            if (sState.skill5_timers) {
                sState.skill5_timers = sState.skill5_timers.map(t => t - 1).filter(t => t > 0);
                if (sState.skill5_timers.length > 0) {
                    ctx.log({ name: "쿼터백 지휘선", icon: "images/famido.webp", customTag: "패시브3" }, `(현재 ${sState.skill5_timers.length}중첩)`);
                }
            }

            if (sState.tactical_stacks < 3) {
                sState.tactical_stacks++;
                ctx.log({ name: "전술 판독", icon: "images/famido.webp", label: "패시브2", customTag: "서포터" }, `스택 획득 (${sState.tactical_stacks}/3)`);
            }
            let actionType = getSupportAction('famido', ctx.t);
            if (actionType === 'ult') {
                ctx.log({ name: "절대 에이스의 포효", icon: "images/famido.webp", label: "필살기", customTag: "서포터" }, "사용");
                sState.skill2_timer = 2;
                const isStamped = !!(state.savedStats['famido']?.stamp);
                if (isStamped) tryApplySupportParam(ctx, sState, p.skill2_fixed_buff, 'skill2_fixed_timer');
                
                // [추가] 필살기도 공격이므로 3스택 시 버프 발동
                if (sState.tactical_stacks >= 3) { 
                    if (tryApplySupportParam(ctx, sState, p.skill4_fixed_buff, 'skill4_boost_timer')) sState.tactical_stacks = 0; 
                }
            } else if (actionType === 'defend') { ctx.log(`[서포터] 파미도: [방어] 실행`); sState.skill4_timer = 2; }
            else {
                ctx.log(`[서포터] 파미도: [보통공격] 사용`);
                if (sState.tactical_stacks >= 3) { if (tryApplySupportParam(ctx, sState, p.skill4_fixed_buff, 'skill4_boost_timer')) sState.tactical_stacks = 0; }
            }
        },
        onEnemyHit: (ctx, sState) => {
            // 아군 4명 피격 시뮬레이션 (5스킬 스택 수급)
            // 본인 피격 여부와 상관없이 엔진 예외처리에 의해 매턴 실행됨
            const savedProb = localStorage.getItem('sim_ctrl_famido_ally_hit_prob');
            const hitProb = (savedProb !== null ? parseInt(savedProb) : 30) / 100;
            if (!sState.skill5_timers) sState.skill5_timers = [];
            for (let i = 0; i < 4; i++) {
                if (Math.random() < hitProb) {
                    supportAddTimer(sState, 'skill5_timers', 3, 4);
                }
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0, "고정공증": 0, "뎀증": 0 };
            // 상시 공증(스킬3) 삭제: 파미도 패시브1은 자기 버프임
            const fStats = state.savedStats['famido'] || { lv: 1, s1: 0, s2: 0 };
            const baseResult = calculateBaseStats(charData['famido'].base, parseInt(fStats.lv || 1), parseInt(fStats.s1 || 0), parseInt(fStats.s2 || 0), 1.05);
            let fBaseAtkBoost = 0;
            if (parseInt(fStats.s1 || 0) >= 50) fBaseAtkBoost += getSupportVal('famido', 5, '기초공증');
            if (sState.skill2_timer > 0) fBaseAtkBoost += getSupportVal('famido', 1, '기초공증');
            if (sState.skill4_timer > 0) fBaseAtkBoost += getSupportVal('famido', 3, '기초공증');
            if ((sState.skill5_timers || []).length > 0) fBaseAtkBoost += sState.skill5_timers.length * getSupportVal('famido', 4, '기초공증');
            const currentFamidoBaseAtk = baseResult["공격력"] * (1 + fBaseAtkBoost / 100);
            if (sState.skill2_fixed_timer > 0) {
                const pos = targetCharData.info?.포지션;
                if (pos === "전사" || pos === "방해") bonuses["고정공증"] += currentFamidoBaseAtk * (getSupportVal('famido', 7, '고정공증') / 100);
            }
            if (sState.skill4_boost_timer > 0) bonuses["고정공증"] += currentFamidoBaseAtk * (getSupportVal('famido', 8, '고정공증') / 100);
            bonuses["뎀증"] += getSupportVal('famido', 6, '뎀증', targetCharData);
            return bonuses;
        }
    },
    "rutenix": {
        getInitialState: () => ({ skill2_timer: 0, skill4_timer: [], skill5_timer: 0, skill7_timer: [] }),
        onTurn: (ctx, sState) => {
            const p = simParams.rutenix; ctx.supportId = 'rutenix';
            if (sState.skill2_timer > 0) sState.skill2_timer--;
            if (sState.skill5_timer > 0) sState.skill5_timer--;
            sState.skill4_timer = (sState.skill4_timer || []).map(t => t - 1).filter(t => t > 0);
            sState.skill7_timer = (sState.skill7_timer || []).map(t => t - 1).filter(t => t > 0);

            // [패시브5] 아군 보통공격 트리거 (1+3n턴 제외)
            const isAllyUltTurn = (ctx.t > 1 && (ctx.t - 1) % 3 === 0);
            if (!isAllyUltTurn) {
                const allyCount = 4;
                for (let i = 0; i < allyCount; i++) {
                    if (Math.random() < 0.5) supportAddTimer(sState, 'skill7_timer', 2, 4);
                }
                if (sState.skill7_timer.length > 0) ctx.log({ name: "분해 분석", icon: "images/rutenix.webp" }, `루테닉스: (현재 ${sState.skill7_timer.length}중첩)`, null, null, false, "서포터");
            }

            let actionType = getSupportAction('rutenix', ctx.t);
            const logIdx = { name: "", icon: "images/rutenix.webp" };
            if (actionType === 'ult') {
                ctx.log(logIdx, "루테닉스: [필살기] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill2_buff, 'skill2_timer');
            } else if (actionType === 'defend') ctx.log(logIdx, "루테닉스: [방어]", null, null, false, "서포터");
            else {
                ctx.log(logIdx, "루테닉스: [보통공격] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill4_buff, 'skill4_timer');
            }
        },
        onEnemyHit: (ctx, sState) => {
            const savedProb = localStorage.getItem('sim_ctrl_rutenix_hit_prob');
            const hitProb = (savedProb !== null ? parseInt(savedProb) : 30) / 100;
            if (Math.random() < hitProb) tryApplySupportParam(ctx, sState, simParams.rutenix.skill5_buff, 'skill5_timer');
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0, "고정공증": 0 };
            bonuses["공증"] += getSupportVal('rutenix', 2, '공증', targetCharData);
            const rStats = state.savedStats['rutenix'] || { lv: 1, s1: 0, s2: 0 };
            const baseResult = calculateBaseStats(charData['rutenix'].base, parseInt(rStats.lv || 1), parseInt(rStats.s1 || 0), parseInt(rStats.s2 || 0), 1.05);
            let rBaseAtkBoost = 0;
            if (parseInt(rStats.s1 || 0) >= 50) rBaseAtkBoost += getSupportVal('rutenix', 5, '기초공증');
            if (sState.skill4_timer?.length > 0) rBaseAtkBoost += sState.skill4_timer.length * getSupportVal('rutenix', 3, 1);
            if (sState.skill5_timer > 0) rBaseAtkBoost += getSupportVal('rutenix', 4, '기초공증');
            if (sState.skill7_timer?.length > 0) rBaseAtkBoost += sState.skill7_timer.length * getSupportVal('rutenix', 6, '기초공증');
            if (sState.skill2_timer > 0) {
                const currentBaseAtk = baseResult["공격력"] * (1 + rBaseAtkBoost / 100);
                const boostRate = getSupportVal('rutenix', 1, 0, null, !!rStats.stamp);
                bonuses["고정공증"] += currentBaseAtk * (boostRate / 100);
            }
            return bonuses;
        }
    },
    "jetblack": {
        getInitialState: () => ({ skill1_timer: 0, skill2_timer: 0, skill5_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.jetblack; ctx.supportId = 'jetblack';
            if (sState.skill1_timer > 0) sState.skill1_timer--;
            if (sState.skill2_timer > 0) sState.skill2_timer--;
            if (sState.skill5_timer > 0) sState.skill5_timer--;
            let actionType = getSupportAction('jetblack', ctx.t);
            const logIdx = { name: "", icon: "images/jetblack.webp" };
            if (actionType === 'ult') {
                ctx.log(logIdx, "제트블랙: [필살기] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill2_buff, 'skill2_timer');
            } else if (actionType === 'defend') ctx.log(logIdx, "제트블랙: [방어]", null, null, false, "서포터");
            else {
                ctx.log(logIdx, "제트블랙: [보통공격] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill1_buff, 'skill1_timer');
                tryApplySupportParam(ctx, sState, p.skill5_buff, 'skill5_timer');
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0, "고정공증": 0, "트리거뎀증": 0 };
            bonuses["공증"] += getSupportVal('jetblack', 2, '공증', targetCharData);
            const supportStats = state.savedStats['jetblack'] || { lv: 1, s1: 0, s2: 0 };
            const baseResult = calculateBaseStats(charData['jetblack'].base, parseInt(supportStats.lv || 1), parseInt(supportStats.s1 || 0), parseInt(supportStats.s2 || 0), 1.05);
            let baseAtkBoostRate = 0;
            if (parseInt(supportStats.s1 || 0) >= 50) baseAtkBoostRate += getSupportVal('jetblack', 5, '기초공증');
            const currentBaseAtk = baseResult["공격력"] * (1 + baseAtkBoostRate / 100);
            if (sState.skill1_timer > 0) bonuses["고정공증"] += currentBaseAtk * (getSupportVal('jetblack', 0, 'max') / 100);
            if (sState.skill2_timer > 0) {
                bonuses["고정공증"] += currentBaseAtk * (getSupportVal('jetblack', 1, 0) / 100);
                bonuses["트리거뎀증"] += getSupportVal('jetblack', 1, 1);
            }
            if (sState.skill5_timer > 0) bonuses["트리거뎀증"] += getSupportVal('jetblack', 4, '트리거뎀증');
            return bonuses;
        }
    },
    "tamrang": {
        getInitialState: () => ({ skill4_timer: 0, skill7_timer: 0, skill8_timer: 0, sleep_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.tamrang; ctx.supportId = 'tamrang';
            if (sState.skill4_timer > 0) sState.skill4_timer--;
            if (sState.skill7_timer > 0) sState.skill7_timer--;
            if (sState.skill8_timer > 0) sState.skill8_timer--;
            if (sState.sleep_timer > 0) sState.sleep_timer--;

            let actionType = getSupportAction('tamrang', ctx.t);
            const logIdx = { name: "", icon: "images/tamrang.webp" };
            if (actionType === 'ult') {
                ctx.log(logIdx, "탐랑: [필살기] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill7_vuln, 'skill7_timer');
                
                // [수정] 도장 디버프와 수면을 하나의 주사위로 통합 처리
                if (tryApplySupportParam(ctx, sState, p.skill8_vuln, 'skill8_timer')) {
                    // 도장 디버프 확률(40%)에 당첨되면 수면 타이머도 동일하게 설정
                    sState.sleep_timer = 2; 
                    // 수면 로그는 엔진에서 p.sleep_status를 따로 안 거치므로 수동으로 남김
                    ctx.log({ name: "[수면]", icon: "images/tamrang.webp" }, "탐랑: 부여 (2턴)", null, null, false, "서포터");
                }
            } else if (actionType === 'defend') {
                ctx.log(logIdx, "탐랑: [방어]", null, null, false, "서포터");
            } else {
                ctx.log(logIdx, "탐랑: [보통공격] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill4_vuln, 'skill4_timer');
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0, "뎀증디버프": 0, "뎀증": 0 };
            // 1. 패시브1: 불속성 공격 강화
            bonuses["공증"] += getSupportVal('tamrang', 2, '공증', targetCharData);
            
            // 2. 패시브2: 단일 받뎀증 (가중치 적용)
            if (sState.skill4_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'tamrang', 3, '뎀증디버프', targetCharData);
            
            // 3. 패시브5: 전체 받뎀증
            if (sState.skill7_timer > 0) bonuses["뎀증디버프"] += getSupportVal('tamrang', 6, '뎀증디버프', targetCharData);
            
            // 4. 도장: 전체 강력 받뎀증 (75%)
            if (sState.skill8_timer > 0) bonuses["뎀증디버프"] += 75; 

            // 5. 패시브4: 수면 대상 데미지 증가 (36%) -> 가중치 적용
            if (sState.sleep_timer > 0) {
                const sleepDmgBonus = getSupportVal('tamrang', 4, '뎀증', targetCharData);
                // 광역기일 경우 1/N 적용, 단일기일 경우 100% 적용
                bonuses["뎀증"] += sleepDmgBonus * (1 / ctx.targetCount);
            }
            
            return bonuses;
        }
    }
};

export function processSupportTurn(ctx, supportId, supportState) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId]) return;
    supportLogic[supportId].onTurn(ctx, supportState);
}

export function processSupportEnemyHit(ctx, supportId, supportState) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId] || !supportLogic[supportId].onEnemyHit) return;
    supportLogic[supportId].onEnemyHit(ctx, supportState);
}

export function processSupportAttack(ctx, supportId, supportState) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId] || !supportLogic[supportId].onAttack) return;
    supportLogic[supportId].onAttack(ctx, supportState);
}

export function getSupportBonuses(supportId, supportState, targetCharData, ctx) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId]) return {};
    return supportLogic[supportId].getBonuses(supportState, targetCharData, ctx);
}

export function initSupportState(supportId) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId]) return {};
    return supportLogic[supportId].getInitialState();
}
