// background-configs.js
// 캐릭터별 배경 이미지의 배율 및 위치 보정 설정

export const backgroundConfigs = {
    // 기본값 (배율 1.0, 위치 보정 0)
    "default": {
        mobile:  { scale: 1.5, xOffset: -25, yOffset: 0 },
        tablet:  { scale: 1.2, xOffset: 0, yOffset: 0 },
        pc:      { scale: 1.0, xOffset: 0, yOffset: 0 }
    },

    // 던컨 찰스 개인 설정
    "duncan": {
        tablet: { xOffset: -150 }, // 태블릿: 1.2배, 오른쪽 150px 이동
        mobile: { xOffset: -200 }  // 모바일: 1.5배, 오른쪽 200px 이동
    },
    "famido": {
        tablet: { xOffset: -150 }, // 태블릿: 1.2배, 오른쪽 150px 이동
        mobile: { xOffset: -300 }  // 모바일: 1.5배, 오른쪽 200px 이동
    },
    "rikano": {
        tablet: { xOffset: 0 }, // 태블릿: 1.2배, 오른쪽 150px 이동
        mobile: { xOffset: -200 }  // 모바일: 1.5배, 오른쪽 200px 이동
    }       
};
