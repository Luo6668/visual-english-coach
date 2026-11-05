import type { SceneNode } from '@/lib/sceneMapData';
import type { TaskGoal } from './model';
const specific: Record<string, [string, string][]> = {
  'coffee-shop': [
    ['点一杯饮料', 'The learner explicitly orders a named drink.'],
    ['说明杯型或偏好', 'The learner specifies drink size, temperature, milk, or sweetness.'],
    ['确认堂食、外带或付款', 'The learner states dine-in/takeaway or asks/confirms payment.'],
  ],
  airport: [
    ['说明值机或航班需求', 'The learner requests check-in or specifies a flight/destination.'],
    ['说明行李或座位偏好', 'The learner states baggage details or a window/aisle seat preference.'],
    ['确认登机信息', 'The learner asks/confirms gate, boarding time, or boarding pass.'],
  ],
  hotel: [
    ['说明入住或预订需求', 'The learner requests check-in or states reservation details.'],
    ['询问一项住宿信息', 'The learner asks about breakfast, Wi-Fi, room, or check-out.'],
    ['提出具体需求或确认安排', 'The learner requests a facility/service or explicitly confirms an arrangement.'],
  ],
};
export function getSceneTasks(scene: SceneNode): TaskGoal[] {
  const definitions = specific[scene.id] ?? [
    ['清楚表达场景中的需求', `The learner states a concrete need relevant to: ${scene.dialogueGoal}`],
    ['补充信息或询问细节', 'The learner provides a relevant concrete detail or asks a relevant specific question.'],
    ['确认理解或下一步安排', 'The learner explicitly confirms an arrangement, clarifies understanding, or requests a concrete next step.'],
  ];
  return definitions.map(([label, criterion], index) => ({ id: `${scene.id}-${index + 1}`, label, criterion }));
}
