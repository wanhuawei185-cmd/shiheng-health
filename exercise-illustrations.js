/* Local, dependency-free line drawings for the movement library. */
(function () {
  const poses = {
    stand: { head:[140,42], shoulder:[140,63], hip:[140,96], arms:[[[140,65],[122,81],[119,95]],[[140,65],[158,81],[161,95]]], legs:[[[140,96],[126,120],[124,145]],[[140,96],[154,120],[156,145]]]},
    march: { head:[140,42], shoulder:[140,63], hip:[140,96], arms:[[[140,65],[120,79],[112,89]],[[140,65],[158,81],[164,92]]], legs:[[[140,96],[126,120],[124,145]],[[140,96],[164,109],[166,130]]]},
    armsUp: { head:[140,42], shoulder:[140,63], hip:[140,96], arms:[[[140,65],[121,47],[116,25]],[[140,65],[159,47],[164,25]]], legs:[[[140,96],[126,120],[124,145]],[[140,96],[154,120],[156,145]]]},
    squat: { head:[126,54], shoulder:[126,75], hip:[148,103], arms:[[[126,76],[106,91],[94,95]],[[126,76],[145,88],[157,92]]], legs:[[[148,103],[130,119],[134,143]],[[148,103],[166,118],[179,140]]]},
    bridgeDown: { head:[57,117], shoulder:[83,122], hip:[126,122], arms:[[[85,123],[88,137],[101,139]],[[86,123],[82,137],[70,139]]], legs:[[[126,122],[155,107],[177,124]],[[126,122],[156,109],[183,126]]]},
    bridgeUp: { head:[57,117], shoulder:[83,122], hip:[126,91], arms:[[[85,123],[88,137],[101,139]],[[86,123],[82,137],[70,139]]], legs:[[[126,91],[157,91],[177,124]],[[126,91],[158,93],[183,126]]]},
    lunge: { head:[140,44], shoulder:[140,65], hip:[140,97], arms:[[[140,66],[121,81],[118,96]],[[140,66],[159,81],[166,91]]], legs:[[[140,97],[129,119],[128,144]],[[140,97],[168,113],[184,139]]]},
    calfUp: { head:[140,42], shoulder:[140,63], hip:[140,96], arms:[[[140,65],[122,81],[118,95]],[[140,65],[158,81],[162,95]]], legs:[[[140,96],[128,119],[126,137]],[[140,96],[152,119],[154,137]]]},
    wallPush: { head:[79,57], shoulder:[98,74], hip:[147,104], arms:[[[99,74],[139,76],[194,78]],[[101,79],[142,86],[194,88]]], legs:[[[147,104],[162,122],[177,143]],[[147,104],[173,118],[194,139]]]},
    wallPushBent: { head:[87,66], shoulder:[104,81], hip:[151,107], arms:[[[104,81],[137,92],[192,85]],[[106,86],[141,101],[192,95]]], legs:[[[151,107],[165,124],[180,143]],[[151,107],[174,121],[196,139]]]},
    kneePushUp: { head:[68,91], shoulder:[91,99], hip:[139,113], arms:[[[92,99],[112,111],[125,125]],[[94,103],[114,115],[127,129]]], legs:[[[139,113],[162,127],[178,136]],[[139,113],[165,128],[183,138]]]},
    kneePushDown: { head:[68,103], shoulder:[91,111], hip:[139,121], arms:[[[92,111],[110,122],[123,136]],[[94,115],[114,126],[127,140]]], legs:[[[139,121],[162,131],[178,138]],[[139,121],[165,132],[183,140]]]},
    bandRowStart: { head:[110,42], shoulder:[110,63], hip:[110,97], arms:[[[110,65],[132,78],[157,89]],[[110,65],[132,81],[157,94]]], legs:[[[110,97],[139,104],[160,111]],[[110,97],[139,106],[162,114]]]},
    bandRowPull: { head:[110,42], shoulder:[110,63], hip:[110,97], arms:[[[110,65],[96,78],[92,88]],[[110,65],[96,81],[92,93]]], legs:[[[110,97],[139,104],[160,111]],[[110,97],[139,106],[162,114]]]},
    pullTogether: { head:[140,42], shoulder:[140,63], hip:[140,96], arms:[[[140,65],[123,78],[128,82]],[[140,65],[157,78],[152,82]]], legs:[[[140,96],[126,120],[124,145]],[[140,96],[154,120],[156,145]]]},
    pullApart: { head:[140,42], shoulder:[140,63], hip:[140,96], arms:[[[140,65],[117,67],[98,68]],[[140,65],[163,67],[182,68]]], legs:[[[140,96],[126,120],[124,145]],[[140,96],[154,120],[156,145]]]},
    hingeDown: { head:[112,43], shoulder:[129,63], hip:[151,99], arms:[[[130,65],[148,87],[159,105]],[[130,65],[148,87],[159,105]]], legs:[[[151,99],[143,122],[142,145]],[[151,99],[169,121],[178,143]]]},
    hingePull: { head:[112,43], shoulder:[129,63], hip:[151,99], arms:[[[130,65],[143,78],[148,92]],[[130,65],[143,78],[148,92]]], legs:[[[151,99],[143,122],[142,145]],[[151,99],[169,121],[178,143]]]},
    supineBent: { head:[55,119], shoulder:[82,124], hip:[128,124], arms:[[[84,124],[104,108],[117,102]],[[84,124],[102,109],[115,104]]], legs:[[[128,124],[152,111],[174,126]],[[128,124],[153,113],[178,128]]]},
    supinePress: { head:[55,119], shoulder:[82,124], hip:[128,124], arms:[[[84,124],[101,98],[103,75]],[[84,124],[99,99],[101,76]]], legs:[[[128,124],[152,111],[174,126]],[[128,124],[153,113],[178,128]]]},
    quadruped: { head:[74,77], shoulder:[98,91], hip:[157,91], arms:[[[98,91],[96,117],[94,139]],[[98,91],[119,112],[124,138]]], legs:[[[157,91],[158,116],[157,139]],[[157,91],[184,112],[188,138]]]},
    birdDog: { head:[74,77], shoulder:[98,91], hip:[157,91], arms:[[[98,91],[76,74],[43,67]],[[98,91],[119,112],[124,138]]], legs:[[[157,91],[178,84],[211,82]],[[157,91],[184,112],[188,138]]]},
    deadBugStart: { head:[55,120], shoulder:[81,124], hip:[126,124], arms:[[[82,124],[73,137],[62,139]],[[82,124],[91,137],[101,139]]], legs:[[[126,124],[145,102],[159,83]],[[126,124],[170,103],[180,84]]]},
    deadBugReach: { head:[55,120], shoulder:[81,124], hip:[126,124], arms:[[[82,124],[73,137],[62,139]],[[82,124],[91,137],[101,139]]], legs:[[[126,124],[145,102],[159,83]],[[126,124],[172,113],[194,137]]]},
    kneePlank: { head:[69,88], shoulder:[92,97], hip:[139,106], arms:[[[92,97],[105,119],[119,133]],[[94,100],[111,119],[126,133]]], legs:[[[139,106],[161,122],[174,137]],[[139,106],[166,123],[180,138]]]},
    catNeutral: { head:[74,78], shoulder:[98,91], hip:[157,91], arms:[[[98,91],[96,117],[94,139]],[[98,91],[119,112],[124,138]]], legs:[[[157,91],[158,116],[157,139]],[[157,91],[184,112],[188,138]]]},
    catRound: { head:[79,96], shoulder:[101,94], hip:[157,78], arms:[[[101,94],[97,117],[94,139]],[[101,94],[120,113],[124,138]]], legs:[[[157,78],[158,111],[157,139]],[[157,78],[184,108],[188,138]]]},
    stretch: { head:[140,42], shoulder:[140,63], hip:[140,96], arms:[[[140,65],[121,45],[119,22]],[[140,65],[160,79],[173,92]]], legs:[[[140,96],[126,120],[124,145]],[[140,96],[154,120],[156,145]]]},
    seated: { head:[112,42], shoulder:[112,63], hip:[112,95], arms:[[[112,65],[132,79],[145,91]],[[112,65],[132,79],[145,91]]], legs:[[[112,95],[142,102],[160,112]],[[112,95],[142,105],[162,115]]]},
    runPose: { head:[140,42], shoulder:[140,63], hip:[140,96], arms:[[[140,65],[122,78],[130,89]],[[140,65],[158,52],[167,61]]], legs:[[[140,96],[121,113],[110,136]],[[140,96],[160,112],[176,130]]]},
    seatedPress: { head:[112,42], shoulder:[112,63], hip:[112,95], arms:[[[112,65],[137,67],[164,67]],[[112,65],[137,73],[164,73]]], legs:[[[112,95],[142,102],[160,112]],[[112,95],[142,105],[162,115]]]},
    seatedArmsUp: { head:[112,42], shoulder:[112,63], hip:[112,95], arms:[[[112,65],[101,43],[98,22]],[[112,65],[123,43],[126,22]]], legs:[[[112,95],[142,102],[160,112]],[[112,95],[142,105],[162,115]]]},
    seatedLegsBent: { head:[112,42], shoulder:[112,63], hip:[112,95], arms:[[[112,65],[132,79],[145,91]],[[112,65],[132,79],[145,91]]], legs:[[[112,95],[142,102],[157,125]],[[112,95],[143,104],[165,126]]]},
    seatedLegsExtended: { head:[112,42], shoulder:[112,63], hip:[112,95], arms:[[[112,65],[132,79],[145,91]],[[112,65],[132,79],[145,91]]], legs:[[[112,95],[145,94],[177,94]],[[112,95],[145,99],[177,99]]]},
    shoulderRaiseStart: { head:[140,42], shoulder:[140,63], hip:[140,96], arms:[[[140,65],[125,78],[122,93]],[[140,65],[155,78],[158,93]]], legs:[[[140,96],[126,120],[124,145]],[[140,96],[154,120],[156,145]]]},
    shoulderRaiseUp: { head:[140,42], shoulder:[140,63], hip:[140,96], arms:[[[140,65],[116,63],[92,63]],[[140,65],[164,63],[188,63]]], legs:[[[140,96],[126,120],[124,145]],[[140,96],[154,120],[156,145]]]},
    kickbackStart: { head:[74,77], shoulder:[98,91], hip:[157,91], arms:[[[98,91],[96,117],[94,139]],[[98,91],[119,112],[124,138]]], legs:[[[157,91],[158,116],[157,139]],[[157,91],[184,112],[188,138]]]},
    kickbackExtend: { head:[74,77], shoulder:[98,91], hip:[157,91], arms:[[[98,91],[96,117],[94,139]],[[98,91],[119,112],[124,138]]], legs:[[[157,91],[185,84],[216,78]],[[157,91],[184,112],[188,138]]]}
  };

  const guide = {
    'warmup-march': ['自然站立','交替抬膝','小步踏稳，配合自然摆臂。','stand','march','floor'],
    'warmup-mobility': ['手臂放松','肩臂轻抬','活动幅度以舒服为准，不要弹震。','stand','armsUp','floor'],
    'chair-squat': ['站在椅前','臀部向后坐','膝盖跟随脚尖，椅子靠墙放稳。','stand','squat','chair'],
    'glute-bridge': ['仰卧屈膝','抬起髋部','轻收腹，不要为了抬高而拱腰。','bridgeDown','bridgeUp','floor'],
    'supported-reverse-lunge': ['扶稳椅背','一脚向后','先用小幅度，保持躯干稳定。','stand','lunge','chair'],
    'calf-raise': ['脚跟落地','缓慢提踵','扶稳椅背，不要弹跳。','stand','calfUp','chair'],
    'wall-pushup': ['手扶墙面','屈肘靠墙','头到脚保持自然直线，墙面需稳固。','wallPush','wallPushBent','wall'],
    'knee-pushup': ['双膝与手撑地','屈肘再推回','腰背保持稳定；吃力时改做墙面版。','kneePushUp','kneePushDown','floor'],
    'band-row': ['坐稳，弹力带绕脚','手肘向后拉','先轻拉检查带子和脚下是否稳固。','bandRowStart','bandRowPull','band'],
    'band-pull-apart': ['双手胸前握带','向两侧拉开','肩膀放松，弹力带远离脸部。','pullTogether','pullApart','bandChest'],
    'dumbbell-row': ['扶稳支撑，俯身','手肘拉向髋部','先用轻重量，躯干不要扭转。','hingeDown','hingePull','chair'],
    'dumbbell-floor-press': ['仰卧，哑铃在胸侧','向上推至舒适位置','使用轻重量，肩部疼痛时停止。','supineBent','supinePress','floor'],
    'bird-dog': ['四点跪姿','伸出对侧手脚','骨盆保持平稳，不要拱腰。','quadruped','birdDog','floor'],
    'dead-bug': ['仰卧，屈膝抬腿','单侧脚跟点地','腰背保持舒适，动作幅度可缩小。','deadBugStart','deadBugReach','floor'],
    'knee-plank': ['前臂和膝盖着地','收腹，自然呼吸','肘在肩下；腰背下塌或疼痛时结束。','kneePlank','kneePlank','floor'],
    'brisk-walk': ['自然站立','平地快走','逐步加快到略喘但仍能说短句。','stand','march','floor'],
    'run-walk-intervals': ['步行热身','轻松跑走交替','按能说短句的节奏慢跑；不追配速。','stand','runPose','treadmill'],
    'gym-leg-press': ['坐稳、脚踩踏板','缓慢推离再回收','膝盖保持自然方向，不锁膝；使用轻重量。','seatedLegsBent','seatedLegsExtended','gymLegPress'],
    'gym-chest-press': ['握把在胸侧','平稳向前推','肩膀放松，不锁肘；先确认座椅高度。','seated','seatedPress','gymChestPress'],
    'gym-lat-pulldown': ['双手握高位横杆','拉向上胸','不猛拽，不把横杆拉到颈后。','seatedArmsUp','seated','cable'],
    'gym-seated-row': ['坐稳，手臂前伸','手肘向后拉','躯干保持直立，不后仰借力。','bandRowStart','bandRowPull','cable'],
    'gym-incline-chest-press': ['握把在胸上方','向前上方平推','背部贴稳靠垫，轻重量开始，不锁肘。','seated','seatedPress','gymChestPress'],
    'gym-pec-deck': ['双臂自然打开','胸前缓慢合拢','肩膀放松，不要将手臂过度向后拉。','pullApart','pullTogether','cable'],
    'gym-shoulder-press': ['手柄在肩部两侧','平稳向上推','腰背贴稳靠垫，不耸肩；出现疼痛就停止。','seatedPress','seatedArmsUp','cable'],
    'gym-lateral-raise': ['手臂自然垂在体侧','抬至肩部附近','使用轻重量，不甩动借力，也不必抬过肩。','shoulderRaiseStart','shoulderRaiseUp','cable'],
    'gym-leg-extension': ['坐稳，膝盖自然弯曲','缓慢伸膝再还原','不猛踢、不锁膝；先请教练确认器械位置。','seatedLegsBent','seatedLegsExtended','gymLegPress'],
    'gym-seated-leg-curl': ['坐稳，腿部伸展','脚跟向后弯曲','固定大腿并轻重量起步；腿后侧抽痛时停止。','seatedLegsExtended','seatedLegsBent','gymLegPress'],
    'gym-hip-thrust': ['背部与髋部放稳','缓慢抬起髋部','脚掌踩实，不要用腰部过度后仰；先确认器械限位。','bridgeDown','bridgeUp','gymHipThrust'],
    'cable-glute-kickback': ['扶稳器械，脚踝固定','小幅向后伸髋','躯干稳定，不扭腰或甩腿；先确认绑带和配重。','kickbackStart','kickbackExtend','cable'],
    'slow-walk': ['自然站立','轻松散步','选择平坦路线，保持能自然交谈。','stand','march','floor'],
    'cat-cow': ['四点跪姿，背部自然','轻柔拱背','配合呼吸活动，只在舒服范围内。','catNeutral','catRound','floor'],
    'cooldown-stretch': ['放松站立','轻抬手臂，慢呼吸','不屏气、不弹震；有疼痛就停止。','stand','stretch','floor']
  };

  function point(value, offsetX = 0, scale = 1, offsetY = 0) {
    return [value[0] * scale + offsetX, value[1] * scale + offsetY];
  }

  function line(a, b, offsetX, scale, offsetY, cls = '') {
    const p1 = point(a, offsetX, scale, offsetY);
    const p2 = point(b, offsetX, scale, offsetY);
    return `<path class="${cls}" d="M${p1[0]} ${p1[1]} L${p2[0]} ${p2[1]}"/>`;
  }

  function chain(points, offsetX, scale, offsetY, cls = '') {
    return points.slice(1).map((p, index) => line(points[index], p, offsetX, scale, offsetY, cls)).join('');
  }

  function drawPose(name, offsetX = 0, scale = 1, offsetY = 0) {
    const pose = poses[name] || poses.stand;
    const head = point(pose.head, offsetX, scale, offsetY);
    const shoulder = point(pose.shoulder, offsetX, scale, offsetY);
    const hip = point(pose.hip, offsetX, scale, offsetY);
    const limb = (parts, cls) => chain(parts, offsetX, scale, offsetY, cls);
    let svg = `<circle class="diagram-head" cx="${head[0]}" cy="${head[1]}" r="${10 * scale}"/>`;
    svg += line(pose.shoulder, pose.hip, offsetX, scale, offsetY, 'diagram-body');
    svg += pose.arms.map((part, index) => limb(part, index ? 'diagram-limb diagram-far' : 'diagram-limb')).join('');
    svg += pose.legs.map((part, index) => limb(part, index ? 'diagram-limb diagram-far' : 'diagram-limb')).join('');
    for (const pointValue of [pose.shoulder, pose.hip, ...pose.arms.flatMap((a) => [a[1]]), ...pose.legs.flatMap((l) => [l[1]])]) {
      const joint = point(pointValue, offsetX, scale, offsetY);
      svg += `<circle class="diagram-joint" cx="${joint[0]}" cy="${joint[1]}" r="${3.4 * scale}"/>`;
    }
    return svg;
  }

  function prop(name, offsetX = 0, scale = 1, offsetY = 0, phase = 0) {
    const X = (n) => n * scale + offsetX;
    const Y = (n) => n * scale + offsetY;
    if (name === 'chair') return `<path class="diagram-prop" d="M${X(190)} ${Y(82)}v34h20M${X(190)} ${Y(116)}v28M${X(210)} ${Y(116)}v28M${X(187)} ${Y(82)}h26"/>`;
    if (name === 'wall') return `<path class="diagram-prop" d="M${X(218)} ${Y(28)}v119M${X(218)} ${Y(82)}h-6"/>`;
    if (name === 'band') return `<path class="diagram-accent" d="M${X(91)} ${Y(89)} Q${X(122)} ${Y(109)} ${X(158)} ${Y(91)}"/>`;
    if (name === 'bandChest') return `<path class="diagram-accent" d="M${X(98)} ${Y(68)} Q${X(140)} ${Y(phase ? 56 : 76)} ${X(182)} ${Y(68)}"/>`;
    if (name === 'treadmill') return `<path class="diagram-prop" d="M${X(74)} ${Y(141)}h142l-11 8H84zM${X(192)} ${Y(141)}l10-46h18M${X(202)} ${Y(95)}h17M${X(93)} ${Y(149)}l-4 5m111-5 4 5"/>`;
    if (name === 'gymLegPress') return `<path class="diagram-prop" d="M${X(178)} ${Y(84)}h32v12h-32m5 0v30h28m-34 0h48M${X(210)} ${Y(90)}l12-10m-12 10 12 12"/>`;
    if (name === 'gymChestPress') return `<path class="diagram-prop" d="M${X(181)} ${Y(75)}v56m0-46h20m-20 20h20m-20 20h26m-35 12h45M${X(201)} ${Y(85)}v26"/>`;
    if (name === 'gymHipThrust') return `<path class="diagram-prop" d="M${X(68)} ${Y(111)}h86v12H68m18 0v25m54-25v25m-84 0h115M${X(150)} ${Y(106)}h38v10h-38"/>`;
    if (name === 'cable') return `<path class="diagram-prop" d="M${X(184)} ${Y(34)}h34m-8 0v34m-8-34v43m-9-9h18m-28 72h39M${X(210)} ${Y(77)}l-8 6"/>`;
    if (name === 'floor') return `<path class="diagram-ground" d="M${X(38)} ${Y(148)}h190"/>`;
    return '';
  }

  function safeText(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[char]);
  }

  function render(exercise, mode = 'wide') {
    const item = guide[exercise.id] || ['准备姿势','缓慢完成动作','放慢速度，保持舒适呼吸。','stand','march','floor'];
    const compact = mode === 'compact';
    const [firstLabel, secondLabel, tip, firstPose, secondPose, propName] = item;
    const safeName = safeText(exercise.name);
    let drawing;
    if (compact) {
      drawing = `<svg class="exercise-diagram-svg is-compact" viewBox="0 0 300 170" role="img" aria-label="${safeName}动作前后姿势示意图">
        <rect class="diagram-panel" x="3" y="5" width="142" height="160" rx="11"/><rect class="diagram-panel" x="155" y="5" width="142" height="160" rx="11"/>
        ${prop(propName, -14, .57, 1, 0)}${drawPose(firstPose, -14, .57, 1)}
        ${prop(propName, 138, .57, 1, 1)}${drawPose(secondPose, 138, .57, 1)}
        <circle class="diagram-arrow-disc" cx="150" cy="83" r="10"/><path class="diagram-arrow" d="M146 83h8m-3-4 4 4-4 4"/>
      </svg>`;
    } else {
      drawing = `<svg class="exercise-diagram-svg" viewBox="0 0 600 190" role="img" aria-label="${safeName}分步动作示意图">
        <rect class="diagram-panel diagram-panel-start" x="5" y="5" width="286" height="180" rx="12"/><rect class="diagram-panel diagram-panel-end" x="309" y="5" width="286" height="180" rx="12"/>
        <text class="diagram-svg-label" x="20" y="25">01 / 准备</text><text class="diagram-svg-label" x="324" y="25">02 / 动作</text>
        <g class="diagram-start-static">${prop(propName, 0, 1, 18, 0)}${drawPose(firstPose, 0, 1, 18)}</g>
        <g class="diagram-motion-start" aria-hidden="true">${prop(propName, 0, 1, 18, 0)}${drawPose(firstPose, 0, 1, 18)}</g>
        <g class="diagram-motion-end" aria-hidden="true">${prop(propName, 0, 1, 18, 1)}${drawPose(secondPose, 0, 1, 18)}</g>
        <g class="diagram-end-static">${prop(propName, 320, 1, 18, 1)}${drawPose(secondPose, 320, 1, 18)}</g>
        <circle class="diagram-arrow-disc" cx="300" cy="99" r="12"/><path class="diagram-arrow" d="M294 99h11m-4-5 5 5-5 5"/>
      </svg>`;
    }
    return `<figure class="exercise-diagram ${compact ? 'exercise-diagram-compact' : ''}" aria-label="${safeName}图示讲解">
      ${compact ? '' : `<div class="exercise-diagram-toolbar"><span class="exercise-motion-note" aria-live="polite">点击播放分解动作</span><button type="button" data-motion-toggle aria-pressed="false">播放动作</button></div>`}
      ${drawing}
      <div class="exercise-diagram-steps"><span class="exercise-step-start"><b>1</b>${safeText(firstLabel)}</span><i aria-hidden="true">→</i><span class="exercise-step-end"><b>2</b>${safeText(secondLabel)}</span></div>
      <figcaption><strong>动作要点</strong>${safeText(tip)}</figcaption>
    </figure>`;
  }

  window.ExerciseIllustrations = { render };
})();
