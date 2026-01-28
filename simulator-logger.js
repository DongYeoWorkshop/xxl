// simulator-logger.js
import { SKILL_IDX, UNLOCK_REQ } from './simulator-common.js';
import { getStatusInfo } from './simulator-status.js';

/**
 * 시뮬레이터 상세 로그(디버그 로그) 메시지를 생성합니다.
 */
export function formatDetailedLog(context, idx, res, chance, dur, customTag = null) {
    const { charData, stats } = context;
    let sName = "스킬", sIcon = "icon/main.png", label = "";

    // 1. 인덱스/객체/문자열에 따른 정보 추출
    if (typeof idx === 'object' && idx !== null) {
        const actualIdx = (idx.originalIdx !== undefined) ? idx.originalIdx : 
                          (idx.originalId ? charData.skills.findIndex(s => s.id === idx.originalId) : -1);
        const s = (actualIdx !== -1) ? charData.skills[actualIdx] : null;
        
        sName = idx.name || s?.name || "";
        sIcon = idx.icon || s?.icon || "icon/main.png";
        
        let labelIdx = actualIdx;
        if (s?.syncLevelWith) {
            const parentIdx = charData.skills.findIndex(ps => ps.id === s.syncLevelWith);
            if (parentIdx !== -1) labelIdx = parentIdx;
        }
        const isStampIcon = sIcon.includes('sigilwebp/');
        const autoLabel = isStampIcon ? "도장" : (labelIdx === 0 ? "보통공격" : labelIdx === SKILL_IDX.ULT ? "필살기" : labelIdx >= 7 ? "도장" : `패시브${labelIdx-1}`);
        label = idx.customTag || customTag || autoLabel;

    } else if (typeof idx === 'number') {
        const br = parseInt(stats.s1 || 0);
        if (UNLOCK_REQ[idx] && br < UNLOCK_REQ[idx]) return null;
        
        const s = charData.skills[idx];
        if (s) {
            sName = s.name;
            sIcon = s.icon || "icon/main.png";
        }
        const isStampIcon = s?.icon && s.icon.includes('sigilwebp/');
        let labelIdx = idx;
        if (s?.syncLevelWith) {
            const parentIdx = charData.skills.findIndex(ps => ps.id === s.syncLevelWith);
            if (parentIdx !== -1) labelIdx = parentIdx;
        }
        const autoLabel = isStampIcon ? "도장" : (labelIdx === 0 ? "보통공격" : labelIdx === SKILL_IDX.ULT ? "필살기" : (labelIdx >= 2 && labelIdx <= 6) ? `패시브${labelIdx-1}` : labelIdx >= 7 ? "도장" : "스킬");
        label = customTag || autoLabel;

    } else if (typeof idx === 'string') {
        const statusInfo = getStatusInfo(idx);
        if (statusInfo) { 
            sName = statusInfo.name; 
            sIcon = statusInfo.icon; 
            label = customTag || ""; 
        } else { 
            sName = (idx.includes('_') || idx.includes('timer')) ? "" : idx;
            if (idx === "피격") sIcon = "icon/simul.png"; 
            else if (idx === "아군공격") sIcon = "icon/compe.png"; 
            label = customTag || ""; 
        }
    }

    // 2. 메시지 조립
    const actionMap = { "Buff": "버프 발동", "Trigger": "발동", "apply": "부여", "consume": "소모", "all_consume": "모두 소모", "gain": "획득", "activate": "발동" };
    let actionMsg = actionMap[res] || "";
    let userMsg = "";
    if (typeof idx === 'object' && idx !== null && idx.label) userMsg = idx.label;
    else userMsg = (actionMap[res] === undefined) ? (res || "") : "";

    let finalRes = (userMsg + " " + actionMsg).trim();
    let m = []; if (chance) m.push(`${chance}%`); if (dur) m.push(`${dur}턴`);
    const mS = m.length ? ` (${m.join(' / ')})` : "";
    
    const finalTag = label ? `[${label.replace(/[\[\]]/g, '')}] ` : "";
    return `ICON:${sIcon}|${finalTag}${sName}${sName && finalRes ? ' ' : ''}${finalRes}${mS}`;
}

/**
 * 시뮬레이터 메인 로그(녹색 텍스트) 라인을 생성합니다.
 */
export function formatMainLog(tLabel, tag, name, damage) {
    return `<div class="sim-log-line"><span>${tLabel}: <span class="sim-log-tag">[${tag}]</span> ${name}:</span> <span class="sim-log-dmg">+${Math.floor(damage).toLocaleString()}</span></div>`;
}