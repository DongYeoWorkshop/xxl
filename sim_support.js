// sim_support.js
import { charData } from './data.js';
import { getDefaultActionPattern } from './simulator-common.js';
import { state, constants } from './state.js';
import { getSkillValue } from './sim_ctx.js';
import { getSkillMultiplier } from './formatter.js';
import { simParams } from './sim_params.js';
import { calculateDamage, calculateBaseStats, assembleFinalStats } from './calculations.js'; // [추가] calculateDamage 임포트

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
    const stats = state.savedStats[charId] || { lv: 1, s1: 0, s2: 0, skills: {}, stamp: false };
    
    // [추가] 돌파 단계 체크: 활성화되지 않은 스킬의 수치는 0으로 반환
    const sBr = parseInt(stats.s1 || 0);
    const thresholds = [0, 0, 0, 0, 30, 50, 75, 75]; 
    if (skillIdx >= 4 && skillIdx <= 7 && sBr < thresholds[skillIdx]) return 0;

    const skill = data.skills[skillIdx];
    const finalIsStamp = isStamp || (!!(stats.stamp) && (skillIdx === 1 || skill?.hasStampEffect || skill?.isUltExtra));

    // 수치 계산용 내부 헬퍼
    const getRawVal = (isS) => {
        if (targetCharData && targetCharData.info) {
            const originalInfo = data.info;
            const tempInfo = { ...data.info, 속성: targetCharData.info.속성 };
            data.info = tempInfo;
            const res = getSkillValue(data, stats, skillIdx, effectKey, isS);
            data.info = originalInfo;
            return res;
        }
        return getSkillValue(data, stats, skillIdx, effectKey, isS);
    };

    let val = getRawVal(finalIsStamp);

    // [특수 처리] 리카노 필살기: 도장 활성화 시 기본 효과 + 추가 효과 합산
    if (charId === 'rikano' && skillIdx === 1 && finalIsStamp && (effectKey === '뎀증디버프' || effectKey === '뎀증')) {
        const baseVal = getRawVal(false); // 도장 없는 기본 수치
        val = baseVal + val; // 기본(15%) + 도장분(3.75%)
    }

    return val;
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

    // [추가] 돌파 단계 체크: 패시브 및 도장 스킬 활성화 제한
    const sBr = parseInt(supportStats.s1 || 0);
    const thresholds = [0, 0, 0, 0, 30, 50, 75, 75]; // 인덱스별 돌파 요구치 (4:30, 5:50, 6:75, 7:75)
    if (sIdx >= 4 && sIdx <= 7 && sBr < thresholds[sIdx]) {
        return false; 
    }

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
        
        // [수정] durationSource 로직 추가 (도장 여부에 따른 지속시간 변경)
        let finalDur = param.duration || 1;
        if (param.durationSource === "stamp:2") {
            // 서포터의 도장 상태 확인
            if (supportStats.stamp) {
                finalDur = 2;
            }
        }
        
        const logDur = finalDur; // 로그용 지속시간도 업데이트
        const maxStacks = param.maxStacks || 1;
        
        // [추가] 피격 타이밍(본인 또는 아군)에 걸리는 버프는 지속시간 +1 보정
        if (param.triggers?.includes("being_hit") || param.triggers?.includes("ally_hit")) {
            finalDur += 1;
        }
        
        supportAddTimer(sState, timerKey, finalDur, maxStacks);

        if (sIdx !== -1) {
            let skill = supportData.skills[sIdx], targetSIdx = sIdx;
            // [수정] 도장 판정 로직 강화: 캐릭터 설정의 도장 상태와 스킬 특성을 함께 고려
            let isStamp = (param.customTag === "도장") || (!!(supportStats.stamp) && (sIdx === 1 || skill.hasStampEffect || skill.isUltExtra));
            
            if (ctx.supportId === 'beernox' && isStamp) { targetSIdx = 1; skill = supportData.skills[1]; isStamp = false; }

            const effectKey = (param.valKey !== undefined) ? param.valKey : (() => {
                const effects = isStamp ? (skill.stampBuffEffects || {}) : (skill.buffEffects || {});
                let key = Object.keys(effects)[0];
                if (!key && skill.ratioEffects) key = Object.keys(skill.ratioEffects)[0];
                return key || "공증";
            })();

            const val = getSupportVal(ctx.supportId, targetSIdx, effectKey, ctx.charData, isStamp);
            
            let boostText = "";
            if (param.showAtkBoost || skill.ratioEffects) {
                const sLv = parseInt(supportStats.lv || 1), sBr = parseInt(supportStats.s1 || 0), sFit = parseInt(supportStats.s2 || 0);
                const baseAtkRaw = supportData.base["공격력"] * Math.pow(1.05, sLv - 1);
                const brBonus = 1 + (sBr * 0.02), fitBonus = 1 + (sFit * 0.04);
                
                let baseAtkBoostRate = 0;
                supportData.skills.forEach((s, idx) => {
                    if (s.buffEffects && s.buffEffects["기초공증"]) {
                        const thresholds = [0, 0, 0, 0, 30, 50, 75]; 
                        if (idx >= 4 && idx <= 6 && sBr < thresholds[idx]) return;

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
                        
                        if (stateVal || (idx >= 2 && idx <= 6 && !s.hasCounter && !s.hasToggle)) {
                            const sVal = getSupportVal(ctx.supportId, idx, '기초공증');
                            let count = 0;
                            if (Array.isArray(stateVal)) count = stateVal.length;
                            else if (typeof stateVal === 'number' && stateVal > 0) {
                                const isStackType = (foundKey && foundKey.includes('stacks')) || s.hasCounter;
                                count = isStackType ? stateVal : 1;
                            } else if (!stateVal && idx >= 2 && idx <= 6) count = 1;
                            
                            if (count > 0) baseAtkBoostRate += (sVal * count);
                        }
                    }
                });

                const currentBaseAtk = baseAtkRaw * brBonus * fitBonus * (1 + baseAtkBoostRate / 100);
                const boostVal = Math.floor(currentBaseAtk * (val / 100));
                boostText = ` (+${boostVal.toLocaleString()} 가산)`;
            }
            const displayProb = (finalProb < 1.0) ? Math.floor(finalProb * 100) : null;
            const logIdx = { name: "", icon: `images/${ctx.supportId}.webp` };
            const skillTag = param.customTag ? `[${param.customTag}] ` : "";
            const supportMsg = `${supportData.title}: ${skillTag}${param.label || skill.name}${boostText}`;
            
            // [롤백] 로그에는 보정 전 지속시간(logDur) 표시
            ctx.log(logIdx, supportMsg, displayProb, logDur, !!param.skipLog, "서포터");
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
        getInitialState: () => ({ passive1_timer: 0, passive2_timer: 0, passive8_timer: 0, taunt_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.rikano; ctx.supportId = 'rikano';
            if (sState.passive1_timer > 0) sState.passive1_timer--;
            if (sState.passive2_timer > 0) sState.passive2_timer--;
            if (sState.passive8_timer > 0) sState.passive8_timer--;
            if (sState.taunt_timer > 0) sState.taunt_timer--;

            let actionType = getSupportAction('rikano', ctx.t);
            const logIdx = { name: "", icon: "images/rikano.webp" };
            if (actionType === 'ult') {
                ctx.log(logIdx, "리카노: [필살기] 사용", null, null, false, "서포터");
                const pUlt = { ...p.skill2_debuff, customTag: "필살기", label: "부여" };
                const pP2 = { ...p.skill8_debuff, customTag: "패시브2", label: "부여" };
                tryApplySupportParam(ctx, sState, pUlt, 'passive2_timer');
                tryApplySupportParam(ctx, sState, pP2, 'passive8_timer');

                // [수정] 도장 활성화 시 조롱 부여 (로그 유지, 가중치 계산은 제거될 예정)
                if (!!(state.savedStats['rikano']?.stamp)) {
                    sState.taunt_timer = 1;
                    ctx.log(logIdx, "리카노: [도장] 조롱 효과 부여", null, 1, false, "서포터");
                }
            } else if (actionType === 'defend') ctx.log(logIdx, "리카노: [방어]", null, null, false, "서포터");
            else {
                ctx.log(logIdx, "리카노: [보통공격] 사용", null, null, false, "서포터");
                const p1 = { ...p.skill1_debuff, customTag: "보통공격", label: "부여" };
                tryApplySupportParam(ctx, sState, p1, 'passive1_timer');
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0, "뎀증디버프": 0, "필살기뎀증": 0, "뎀증": 0 };
            bonuses["공증"] += getSupportVal('rikano', 2, '공증', targetCharData);
            bonuses["필살기뎀증"] += getSupportVal('rikano', 3, '필살기뎀증', targetCharData);
            if (sState.passive1_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'rikano', 0, '뎀증디버프', targetCharData);
            if (sState.passive2_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'rikano', 1, '뎀증디버프', targetCharData);
            if (sState.passive8_timer > 0) bonuses["뎀증디버프"] += getWeightedSupportVal(ctx, 'rikano', 7, '뎀증디버프', targetCharData);
            
            // [수정] 조롱 상태일 때 뎀증 보너스 적용 (가중치 제거)
            if (sState.taunt_timer > 0) {
                bonuses["뎀증"] += getSupportVal('rikano', 6, '뎀증', targetCharData);
            }
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
                ctx.log({ name: "", icon: "images/orem.webp" }, "오렘: [필살기] 아군 전체 [배리어] 부여 (2턴)", null, null, false, "서포터");
            }
        },
        onEnemyHit: (ctx, sState) => {
            if (sState.shield_timer > 0) {
                const hitCount = parseInt(localStorage.getItem('sim_ctrl_orem_orem_hit_count') || 0);
                if (hitCount > 0) {
                    const reflectCoef = getSupportVal('orem', 6, '추가데미지');
                    for (let k = 0; k < hitCount; k++) {
                        // [수정] 아이콘을 캐릭터 본인 아이콘으로 변경
                        ctx.log({ name: "충격 역류 (반사)", icon: "images/orem.webp", customTag: "서포터", coef: reflectCoef, type: "추가공격" }, "activate");
                        if (!ctx.extraHits) ctx.extraHits = [];
                        ctx.extraHits.push({ name: "오렘: 충격 역류", skillId: "orem_skill7", val: reflectCoef, type: "추가공격", customTag: "서포터", icon: "images/orem.webp" });
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
                    // [수정] 아이콘을 캐릭터 본인 아이콘으로 변경
                    ctx.extraHits.push({ 
                        name: "오렘: [도장] 현측 방어 전개", 
                        skillId: "orem_skill8", 
                        val: oremExtraCoef, 
                        type: "추가공격", 
                        customTag: "서포터", 
                        icon: "images/orem.webp" 
                    });
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
                const logIdx = { name: "", icon: "images/wang.webp" };
                // [수정] 스킬 이름 제거: 멍: [필살기] 사용
                ctx.log(logIdx, "멍: [필살기] 사용", null, null, false, "서포터");
                sState.skill2_timer = 3;
                ctx.log(logIdx, "멍: 아군 전체 [패란의 영감] 부여 (3턴)", null, null, false, "서포터");
            } else if (actionType === 'defend') ctx.log({ name: "", icon: "images/wang.webp" }, "멍: [방어]", null, null, false, "서포터");
            else ctx.log({ name: "", icon: "images/wang.webp" }, "멍: [보통공격] 사용", null, null, false, "서포터");
        },
        onEnemyHit: (ctx, sState) => {
            const savedProb = localStorage.getItem('sim_ctrl_wang_hit_prob');
            const hitProb = (savedProb !== null ? parseInt(savedProb) : 30) / 100;
            if (Math.random() < hitProb) {
                sState.skill5_stacks = Math.min(2, sState.skill5_stacks + 1);
                sState.skill5_timer = 3; // 피격 보정 적용 (2+1)
                
                // [수정] 로그 형식 변경: [서포터] 멍: [패시브3] 부여 (N중첩) (2턴)
                const logIdx = { name: "", icon: "images/wang.webp" };
                const msg = `멍: [패시브3] 부여 (${sState.skill5_stacks}중첩)`;
                ctx.log(logIdx, msg, null, 2, false, "서포터");
            }
        },
        onAttack: (ctx, sState) => {
            if (!ctx.isUlt && sState.skill2_timer > 0) {
                const wangStats = state.savedStats['wang'] || {};
                const isWangStamped = !!(wangStats.stamp);
                const hitCoef = getSupportVal('wang', 1, '추가공격', ctx.charData, isWangStamped);
                if (!ctx.extraHits) ctx.extraHits = [];
                // [수정] 아이콘을 캐릭터 본인 아이콘으로 변경
                ctx.extraHits.push({ 
                    name: "멍: 패란의 영감", 
                    skillId: "wang_skill2", 
                    val: hitCoef, 
                    type: "추가공격", 
                    customTag: "서포터", 
                    icon: "images/wang.webp" 
                });
                if (isWangStamped && Math.random() < 0.5) {
                    // [수정] 아이콘을 캐릭터 본인 아이콘으로 변경
                    ctx.extraHits.push({ 
                        name: "멍: [도장] 패란의 영감", 
                        skillId: "wang_skill2", 
                        val: hitCoef, 
                        type: "추가공격", 
                        customTag: "서포터", 
                        icon: "images/wang.webp" 
                    });
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
    "codeb": {
        getInitialState: () => ({ skill2_timer: 0 }),
        onTurn: (ctx, sState) => {
            const p = simParams.codeb; ctx.supportId = 'codeb';
            if (sState.skill2_timer > 0) sState.skill2_timer--;
            
            let actionType = getSupportAction('codeb', ctx.t);
            const logIdx = { name: "", icon: "images/codeb.webp" };
            
            if (actionType === 'ult') {
                ctx.log(logIdx, "코드B: [필살기] 사용", null, null, false, "서포터");
                // 디버프 부여 (durationSource 자동 적용됨)
                const pUlt = { ...p.skill2_debuff, label: "디버프 부여" };
                tryApplySupportParam(ctx, sState, pUlt, 'skill2_timer');
            } else if (actionType === 'defend') {
                ctx.log(logIdx, "코드B: [방어]", null, null, false, "서포터");
            } else {
                ctx.log(logIdx, "코드B: [보통공격] 사용", null, null, false, "서포터");
            }
        },
        onAfterHit: (ctx, sState) => {
            // [매 피격 고정 데미지] - 메인 캐릭터 타격 시마다 반응
            if (sState.skill2_timer > 0) {
                const supportStats = state.savedStats['codeb'] || {};
                const isStamped = !!(supportStats.stamp);
                
                const valKey = "기초공격"; 
                const supportData = charData['codeb'];
                const sLv = parseInt(supportStats.lv || 1);
                const sBr = parseInt(supportStats.s1 || 0);
                const sFit = parseInt(supportStats.s2 || 0);
                const baseResult = calculateBaseStats(supportData.base, sLv, sBr, sFit, 1.05, supportData.grade);
                
                let baseAtkBoost = 0;
                if (sBr >= 50) baseAtkBoost += getSupportVal('codeb', 5, '기초공증');
                
                const currentBaseAtk = Math.floor(baseResult["공격력"] * (1 + baseAtkBoost / 100));
                const coef = getSupportVal('codeb', 7, valKey, null, isStamped);

                ctx.extraHits.push({
                    name: "코드B: 황혼 연사",
                    val: coef,
                    type: "기초공격",
                    baseAtk: currentBaseAtk,
                    customTag: "서포터",
                    icon: "images/codeb.webp",
                    hitType: "기초공격"
                });
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0 };
            bonuses["공증"] += getSupportVal('codeb', 2, '공증', targetCharData);
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
                // [수정] 필살기 태그 추가
                const pUlt = { ...p.skill2_buff, customTag: "필살기" };
                tryApplySupportParam(ctx, sState, pUlt, 'ult_timer');
            } else if (actionType === 'defend') ctx.log(logIdx, "던컨 찰스: [방어]", null, null, false, "서포터");
            else {
                ctx.log(logIdx, "던컨 찰스: [보통공격] 사용", null, null, false, "서포터");
                // [수정] 패시브2 태그 추가
                const p2_fixed = { ...p.skill4_buff, customTag: "패시브2" };
                const p2_prob = { ...p.skill9_buff, customTag: "패시브2" };
                tryApplySupportParam(ctx, sState, p2_fixed, 'normal_timer');
                tryApplySupportParam(ctx, sState, p2_prob, 'prob_timer');
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
            if (woodActive && ctx.t === 1) ctx.log({ name: "", icon: "images/beernox.webp" }, "비어녹스: [패시브3] 나무속성 파티원 조건 충족", null, null, false, "서포터");
            let actionType = getSupportAction('beernox', ctx.t);
            const logIdx = { name: "", icon: "images/beernox.webp" };
            if (actionType === 'ult') {
                ctx.log(logIdx, "비어녹스: [필살기] 사용", null, null, false, "서포터");
                tryApplySupportParam(ctx, sState, p.skill2_buff, 'skill2_timer');
                
                // [수정] 로그 라벨 간소화
                const pStamp = { ...p.skill2_stamp_buff, label: "버프 부여" };
                tryApplySupportParam(ctx, sState, pStamp, 'skill2_stamp_timer');
            } else if (actionType === 'defend') {
                ctx.log(logIdx, "비어녹스: [방어]", null, null, false, "서포터");
            } else {
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
                // [수정] 루테닉스 스타일 템플릿 적용: 파미도: [패시브3] 발동 (N중첩) (2턴)
                if (sState.skill5_timers.length > 0) {
                    ctx.log({ name: "", icon: "images/famido.webp" }, `파미도: [패시브3] 발동 (${sState.skill5_timers.length}중첩)`, null, 2, false, "서포터");
                }
            }

            if (sState.tactical_stacks < 3) {
                sState.tactical_stacks++;
                // [수정] 템플릿 적용 및 아이콘 명시
                ctx.log({ name: "", icon: "images/famido.webp" }, `파미도: [패시브2] 전술 판독 스택 획득 (${sState.tactical_stacks}/3)`, null, null, false, "서포터");
            }
            let actionType = getSupportAction('famido', ctx.t);
            const logIdx = { name: "", icon: "images/famido.webp" };
            if (actionType === 'ult') {
                // [수정] 템플릿 적용
                ctx.log(logIdx, "파미도: [필살기] 사용", null, null, false, "서포터");
                sState.skill2_timer = 2;
                const isStamped = !!(state.savedStats['famido']?.stamp);
                if (isStamped) tryApplySupportParam(ctx, sState, p.skill2_fixed_buff, 'skill2_fixed_timer');
                
                if (sState.tactical_stacks >= 3) { 
                    if (tryApplySupportParam(ctx, sState, p.skill4_fixed_buff, 'skill4_boost_timer')) sState.tactical_stacks = 0; 
                }
            } else if (actionType === 'defend') { 
                // [수정] 템플릿 적용 및 아이콘 복구
                ctx.log(logIdx, "파미도: [방어]", null, null, false, "서포터");
                sState.skill4_timer = 2; 
            } else {
                // [수정] 템플릿 적용 및 아이콘 복구
                ctx.log(logIdx, "파미도: [보통공격] 사용", null, null, false, "서포터");
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
                // [수정] 용어 변경: 부여 -> 발동
                if (sState.skill7_timer.length > 0) {
                    ctx.log({ name: "", icon: "images/rutenix.webp" }, `루테닉스: [패시브5] 발동 (${sState.skill7_timer.length}중첩)`, null, 2, false, "서포터");
                }
            }

            let actionType = getSupportAction('rutenix', ctx.t);
            const logIdx = { name: "", icon: "images/rutenix.webp" };
            if (actionType === 'ult') {
                ctx.log(logIdx, "루테닉스: [필살기] 사용", null, null, false, "서포터");
                // [수정] 템플릿 적용: 루테닉스: [필살기] 발동
                const pUlt = { ...p.skill2_buff, customTag: "필살기", label: "발동" };
                tryApplySupportParam(ctx, sState, pUlt, 'skill2_timer');
            } else if (actionType === 'defend') ctx.log(logIdx, "루테닉스: [방어]", null, null, false, "서포터");
            else {
                ctx.log(logIdx, "루테닉스: [보통공격] 사용", null, null, false, "서포터");
                // [수정] 템플릿 적용: 루테닉스: [패시브2] 발동
                const p2 = { ...p.skill4_buff, customTag: "패시브2", label: "발동" };
                tryApplySupportParam(ctx, sState, p2, 'skill4_timer');
            }
        },
        onEnemyHit: (ctx, sState) => {
            const savedProb = localStorage.getItem('sim_ctrl_rutenix_hit_prob');
            const hitProb = (savedProb !== null ? parseInt(savedProb) : 30) / 100;
            // [수정] 템플릿 적용: 루테닉스: [패시브3] 발동
            const p3 = { ...simParams.rutenix.skill5_buff, customTag: "패시브3", label: "발동" };
            if (Math.random() < hitProb) tryApplySupportParam(ctx, sState, p3, 'skill5_timer');
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
                // [수정] 패시브3 태그 추가
                const p3 = { ...p.skill5_buff, customTag: "패시브3" };
                tryApplySupportParam(ctx, sState, p3, 'skill5_timer');
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
                const p5 = { ...p.skill7_vuln, customTag: "패시브5" };
                tryApplySupportParam(ctx, sState, p5, 'skill7_timer');
                
                // [수정] 수면 면역 체크 (서포터 전용 설정값 로드)
                const isImmune = localStorage.getItem('sim_ctrl_tamrang_is_sleep_immune') === 'true';
                if (!isImmune) {
                    // [수정] 수면(기본)과 도장 디버프(선택) 분리
                    const s8 = p.skill8_vuln; // 확률 파라미터용 (수면/도장 확률 동일 가정)
                    const supportStats = state.savedStats['tamrang'] || { skills: {} };
                    const sLv = parseInt(supportStats.skills?.s2 || 1);
                    const rate = getSkillMultiplier(sLv, s8.startRate || 0.73);
                    const finalProb = (s8.prob || 0.4) * rate;
                    const displayProb = Math.floor(finalProb * 100);

                    // 1. 수면 시도 (기본 효과)
                    if (Math.random() < finalProb) {
                        sState.sleep_timer = 2;
                        ctx.log({ name: "", icon: "images/tamrang.webp" }, "탐랑: [수면] 부여", displayProb, 2, false, "서포터");
                        
                        // 2. 도장 디버프 시도 (도장 활성 시에만, 확률은 수면과 공유하거나 개별 시행)
                        // 데이터상 "수면을 건 후... 받뎀증 부여" 이므로 수면 성공 시에만 체크하는 것이 맞음
                        if (supportStats.stamp) {
                             sState.skill8_timer = 2;
                             ctx.log({ name: "", icon: "images/tamrang.webp" }, "탐랑: [도장] 디버프 부여", null, 2, false, "서포터");
                        }
                    }
                }
            } else if (actionType === 'defend') {
                ctx.log(logIdx, "탐랑: [방어]", null, null, false, "서포터");
            } else {
                ctx.log(logIdx, "탐랑: [보통공격] 사용", null, null, false, "서포터");
                // [수정] 패시브2 태그 명시
                const p2 = { ...p.skill4_vuln, customTag: "패시브2" };
                tryApplySupportParam(ctx, sState, p2, 'skill4_timer');
            }
        },
        onAfterAction: (ctx, sState) => {
            // 행동 종료 후 처리 (현재는 없음)
        },
        onPostAttack: (ctx, sState) => {
            ctx.supportId = 'tamrang';
            // [추가] 메인 공격 종료 후 즉시 수면 및 디버프 해제 (임부언 추가타 등 2회 적용 방지)
            if (ctx.damageOccurred) {
                if (sState.sleep_timer > 0 || sState.skill8_timer > 0) {
                    sState.sleep_timer = 0;
                    sState.skill8_timer = 0;
                    ctx.log({ name: "", icon: "images/tamrang.webp" }, "탐랑: [수면/도장디버프] 해제 (피격/소모)", null, null, false, "서포터");
                }
            }
        },
        onStepEnd: (ctx, sState, step) => {
            // [안전장치] 데미지가 발생한 단계(Step)가 끝나는 즉시 수면 및 도장 디버프 해제
            if (ctx.damageOccurred) {
                if (sState.sleep_timer > 0 || sState.skill8_timer > 0) {
                    sState.sleep_timer = 0;
                    sState.skill8_timer = 0;
                    ctx.log({ name: "", icon: "images/tamrang.webp" }, "탐랑: [수면/도장디버프] 해제 (피격/소모)", null, null, false, "서포터");
                }
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
            if (sState.skill8_timer > 0) bonuses["뎀증디버프"] += getSupportVal('tamrang', 7, '뎀증디버프', targetCharData); 

            // 5. 패시브3: 수면 대상 데미지 증가 (36%)
            if (sState.sleep_timer > 0) {
                bonuses["뎀증"] += getSupportVal('tamrang', 4, '뎀증', targetCharData);
            }
            
            return bonuses;
        }
    },
    "bossren": {
        getInitialState: () => ({ skill1_timer: 0, skill4_timer: 0, skill7_timer: 0, skill8_timer: 0, pending_extra_action: false, pending_buffs: false }),
        onTurn: (ctx, sState) => {
            ctx.supportId = 'bossren';
            if (sState.skill1_timer > 0) sState.skill1_timer--;
            if (sState.skill4_timer > 0) sState.skill4_timer--;
            if (sState.skill7_timer > 0) sState.skill7_timer--;
            if (sState.skill8_timer > 0) sState.skill8_timer--;

            let actionType = getSupportAction('bossren', ctx.t);
            const logIdx = { name: "", icon: "images/bossren.webp" };
            const isPos3 = (ctx.charId === 'famido' && ctx.customValues.pos3_fixed);

            if (actionType === 'normal') {
                ctx.log(logIdx, "임부언: [보통공격] 사용", null, null, false, "서포터");
                if (!isPos3) {
                    const p = simParams.bossren;
                    tryApplySupportParam(ctx, sState, p.skill1_buff, 'skill1_timer');
                    tryApplySupportParam(ctx, sState, p.skill4_buff, 'skill4_timer');
                    tryApplySupportParam(ctx, sState, p.skill7_buff, 'skill7_timer');
                    tryApplySupportParam(ctx, sState, p.skill8_buff, 'skill8_timer');
                }
            } else if (actionType === 'ult') {
                // [수정] 로그 출력을 onPostAttack으로 이동하여 가독성 개선
                sState.pending_buffs = true;

                // 추가 행동 예약 (isPos3이면 onPostAttack에서 차단됨)
                const bStats = state.savedStats['bossren'] || {};
                if (bStats.stamp) {
                    sState.pending_extra_action = true;
                }
            } else if (actionType === 'defend') {
                ctx.log(logIdx, "임부언: [방어]", null, null, false, "서포터");
            }
        },
        onPostAttack: (ctx, sState) => {
            ctx.supportId = 'bossren';
            // [수정] 메인 행동 직후(추가 행동 전)에 예약된 버프 적용
            if (sState.pending_buffs) {
                const logIdx = { name: "", icon: "images/bossren.webp" };
                ctx.log(logIdx, "임부언: [필살기] 사용", null, null, false, "서포터");

                const isPos3 = (ctx.charId === 'famido' && ctx.customValues.pos3_fixed);
                const p = simParams.bossren;
                if (!isPos3) {
                    tryApplySupportParam(ctx, sState, p.skill4_buff, 'skill4_timer');
                    tryApplySupportParam(ctx, sState, p.skill8_buff, 'skill8_timer');
                }
                tryApplySupportParam(ctx, sState, p.skill7_buff, 'skill7_timer');
                sState.pending_buffs = false;
            }

            // [수정] 모든 메인 캐릭터 처리가 끝난 후 최하단에서 추가 행동 발동
            if (sState.pending_extra_action) {
                // 파미도 포지션 3 체크
                const isPos3 = (ctx.charId === 'famido' && ctx.customValues.pos3_fixed);
                const exceptionChars = ['kumoyama', 'wang']; 
                
                if (!isPos3 && !exceptionChars.includes(ctx.charId)) {
                    // [핵심] 엔진에 신호만 보냄 (엔진이 extraPattern을 확인하여 처리함)
                    const extraPatternData = ctx.extraPattern || {};
                    const extraActionType = extraPatternData[ctx.t - 1] || 'ult';

                    ctx.extraHits.push({
                        isActionReplay: true,
                        extraActionType: extraActionType,
                        customTag: "추가행동"
                    });
                }
                sState.pending_extra_action = false; 
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0, "고정공증": 0, "뎀증": 0 };
            
            // [수정] 메인이 파미도일 때 포지션 3 체크 여부 확인 (ctx.customValues 사용)
            const isPos3 = (ctx.charId === 'famido' && ctx.customValues.pos3_fixed);

            // 1. 상시 공증 (패시브1)
            bonuses["공증"] += getSupportVal('bossren', 2, '공증', targetCharData);
            
            // 2. 뎀증 (패시브5 - 최고의 보상)
            if (sState.skill7_timer > 0) {
                // 현재 턴 임부언의 행동 확인
                let actionType = getSupportAction('bossren', ctx.t);
                const isFromUlt = (actionType === 'ult');
                
                // 포지션 3이 아니거나, 임부언이 필살기를 쓴 턴(전체 버프)인 경우에만 적용
                if (!isPos3 || isFromUlt) {
                    bonuses["뎀증"] += getSupportVal('bossren', 6, '뎀증', targetCharData);
                }
            }

            // 3. 고정 가산 계산 (임부언의 실시간 기초공격력 기준)
            // 포지션 3에 고정된 경우, 포지션 1 전용인 가산 버프는 모두 제외
            if (!isPos3) {
                const supportStats = state.savedStats['bossren'] || { lv: 1, s1: 0, s2: 0 };
                const baseResult = calculateBaseStats(charData['bossren'].base, parseInt(supportStats.lv || 1), parseInt(supportStats.s1 || 0), parseInt(supportStats.s2 || 0), 1.05);
                let baseAtkBoostRate = 0;
                if (parseInt(supportStats.s1 || 0) >= 50) baseAtkBoostRate += getSupportVal('bossren', 5, '기초공증');
                const currentBaseAtk = baseResult["공격력"] * (1 + baseAtkBoostRate / 100);

                if (sState.skill1_timer > 0) bonuses["고정공증"] += currentBaseAtk * (getSupportVal('bossren', 0, 0) / 100);
                if (sState.skill4_timer > 0) bonuses["고정공증"] += currentBaseAtk * (getSupportVal('bossren', 3, 0) / 100);
                if (sState.skill8_timer > 0) bonuses["고정공증"] += currentBaseAtk * (getSupportVal('bossren', 7, 0) / 100);
            }

            return bonuses;
        }
    },
    "dallawan": {
        getInitialState: () => ({ skill2_timer: 0, skill4_timer: 0, skill5_timer: 0, skill2_stamp_timer: 0, skill2_stamp_dmg_timer: 0 }),
        onTurn: (ctx, sState) => {
            ctx.supportId = 'dallawan';
            if (sState.skill2_timer > 0) sState.skill2_timer--;
            if (sState.skill4_timer > 0) sState.skill4_timer--;
            if (sState.skill5_timer > 0) sState.skill5_timer--;
            if (sState.skill2_stamp_timer > 0) sState.skill2_stamp_timer--;
            if (sState.skill2_stamp_dmg_timer > 0) sState.skill2_stamp_dmg_timer--;

            let actionType = getSupportAction('dallawan', ctx.t);
            const logIdx = { name: "", icon: "images/dallawan.webp" };
            const dallawanStats = state.savedStats['dallawan'] || {};
            
            // 1. 필살기 사용
            if (actionType === 'ult') {
                ctx.log(logIdx, "다라완: [필살기] 사용", null, null, false, "서포터");
                sState.skill2_timer = 1;
                
                const supportStats = state.savedStats['dallawan'] || { lv: 1, s1: 0, s2: 0 };
                const baseResult = calculateBaseStats(charData['dallawan'].base, parseInt(supportStats.lv || 1), parseInt(supportStats.s1 || 0), parseInt(supportStats.s2 || 0), 1.05);
                let baseAtkBoost = 0;
                if (parseInt(supportStats.s1 || 0) >= 50) baseAtkBoost += getSupportVal('dallawan', 5, '기초공증');
                const currentBaseAtk = baseResult["공격력"] * (1 + baseAtkBoost / 100);
                const addVal = Math.floor(currentBaseAtk * (getSupportVal('dallawan', 1, '고정공증') / 100));

                ctx.log(logIdx, `다라완: [필살기] 버프 부여 (+${addVal.toLocaleString()} 가산)`, null, 1, false, "서포터");

                if (dallawanStats.stamp) {
                    sState.skill2_stamp_timer = 2;
                    ctx.log(logIdx, `다라완: [도장] 목장주 명령 부여`, null, 2, false, "서포터");
                }
            } 
            // 2. 보통공격 사용
            else if (actionType === 'normal') {
                ctx.log(logIdx, "다라완: [보통공격] 사용", null, null, false, "서포터");
                if (Math.random() < 0.5) {
                    sState.skill4_timer = 2;
                    const supportStats = state.savedStats['dallawan'] || { lv: 1, s1: 0, s2: 0 };
                    const baseResult = calculateBaseStats(charData['dallawan'].base, parseInt(supportStats.lv || 1), parseInt(supportStats.s1 || 0), parseInt(supportStats.s2 || 0), 1.05);
                    let baseAtkBoost = 0;
                    if (parseInt(supportStats.s1 || 0) >= 50) baseAtkBoost += getSupportVal('dallawan', 5, '기초공증');
                    const currentBaseAtk = baseResult["공격력"] * (1 + baseAtkBoost / 100);
                    const addVal = Math.floor(currentBaseAtk * (getSupportVal('dallawan', 3, '고정공증') / 100));

                    ctx.log(logIdx, `다라완: [패시브2] 버프 부여 (+${addVal.toLocaleString()} 가산)`, 50, 2, false, "서포터");
                }
            }

            // 3. 회복 발생 시 처리 (도장 및 패시브3)
            const baseRecProb = (parseInt(localStorage.getItem('sim_ctrl_dallawan_recovery_rate') || 0)) / 100;
            const isUltFullHeal = localStorage.getItem('sim_ctrl_dallawan_ult_turn_full_heal') === 'true';
            let currentRecOccurred = (actionType === 'ult' && isUltFullHeal) || (baseRecProb > 0 && Math.random() < baseRecProb);

            if (currentRecOccurred) {
                if (dallawanStats.stamp && sState.skill2_stamp_timer > 0) {
                    if (Math.random() < 0.5) {
                        sState.skill2_stamp_dmg_timer = 1;
                        ctx.log(logIdx, `다라완: [도장] 버프 부여`, 50, 1, false, "서포터");
                    }
                }
                if (Math.random() < 0.33) {
                    sState.skill5_timer = 1;
                    const supportStats = state.savedStats['dallawan'] || { lv: 1, s1: 0, s2: 0 };
                    const baseResult = calculateBaseStats(charData['dallawan'].base, parseInt(supportStats.lv || 1), parseInt(supportStats.s1 || 0), parseInt(supportStats.s2 || 0), 1.05);
                    let baseAtkBoost = 0;
                    if (parseInt(supportStats.s1 || 0) >= 50) baseAtkBoost += getSupportVal('dallawan', 5, '기초공증');
                    const currentBaseAtk = baseResult["공격력"] * (1 + baseAtkBoost / 100);
                    const addVal = Math.floor(currentBaseAtk * (getSupportVal('dallawan', 4, '고정공증') / 100));
                    ctx.log(logIdx, `다라완: [패시브3] 버프 부여 (+${addVal.toLocaleString()} 가산)`, 33, 1, false, "서포터");
                }
            }
        },
        getBonuses: (sState, targetCharData, ctx) => {
            let bonuses = { "공증": 0, "고정공증": 0, "뎀증": 0 };
            bonuses["공증"] += getSupportVal('dallawan', 2, '공증', targetCharData);
            const supportStats = state.savedStats['dallawan'] || { lv: 1, s1: 0, s2: 0 };
            const baseResult = calculateBaseStats(charData['dallawan'].base, parseInt(supportStats.lv || 1), parseInt(supportStats.s1 || 0), parseInt(supportStats.s2 || 0), 1.05);
            let baseAtkBoost = 0;
            if (parseInt(supportStats.s1 || 0) >= 50) baseAtkBoost += getSupportVal('dallawan', 5, '기초공증');
            const currentBaseAtk = baseResult["공격력"] * (1 + baseAtkBoost / 100);
            const sBr = parseInt(supportStats.s1 || 0);
            if (sState.skill2_timer > 0) bonuses["고정공증"] += currentBaseAtk * (getSupportVal('dallawan', 1, '고정공증') / 100);
            if (sState.skill4_timer > 0 && sBr >= 15) bonuses["고정공증"] += currentBaseAtk * (getSupportVal('dallawan', 3, '고정공증') / 100);
            if (sState.skill5_timer > 0 && sBr >= 30) bonuses["고정공증"] += currentBaseAtk * (getSupportVal('dallawan', 4, '고정공증') / 100);
            // 3. 도장 뎀증 보너스 (스킬9 수치 동적 획득)
            if (sState.skill2_stamp_dmg_timer > 0) {
                // 스킬 9(인덱스 8)의 뎀증 효과 수치를 가져옴 (도장 활성 상태이므로 isStamp=true)
                bonuses["뎀증"] += getSupportVal('dallawan', 8, '뎀증', targetCharData, true);
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

export function processSupportPostAttack(ctx, supportId, supportState) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId] || !supportLogic[supportId].onPostAttack) return;
    supportLogic[supportId].onPostAttack(ctx, supportState);
}

// [추가] 타격 직후 서포터 반응 처리
export function processSupportAfterHit(ctx, supportId, supportState) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId] || !supportLogic[supportId].onAfterHit) return;
    supportLogic[supportId].onAfterHit(ctx, supportState);
}

export function processSupportAfterAction(ctx, supportId, supportState) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId] || !supportLogic[supportId].onAfterAction) return;
    supportLogic[supportId].onAfterAction(ctx, supportState);
}

export function processSupportStepEnd(ctx, supportId, supportState, step) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId] || !supportLogic[supportId].onStepEnd) return;
    supportLogic[supportId].onStepEnd(ctx, supportState, step);
}

export function getSupportBonuses(supportId, supportState, targetCharData, ctx) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId]) return {};
    return supportLogic[supportId].getBonuses(supportState, targetCharData, ctx);
}

export function initSupportState(supportId) {
    if (!supportId || supportId === 'none' || !supportLogic[supportId]) return {};
    return supportLogic[supportId].getInitialState();
}
