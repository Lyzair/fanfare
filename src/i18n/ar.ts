// Translation: machine-assisted — native speakers, please review.
import type { LanguagePack } from './index';
import type { SportId } from '../domain/model';
import { makeTemplates } from './templates';

const sports: Record<SportId, { name: string; scoreWord: string; positions: string[] }> = {
  football: { name: 'كرة القدم', scoreWord: 'هدف', positions: ['حارس المرمى', 'الدفاع', 'الوسط', 'الهجوم'] },
  handball: { name: 'كرة اليد', scoreWord: 'هدف', positions: ['حارس المرمى', 'الجناح الأيسر', 'الظهير الأيسر', 'لاعب الوسط', 'الظهير الأيمن', 'الجناح الأيمن', 'لاعب الدائرة'] },
  basketball: { name: 'كرة السلة', scoreWord: 'سلة', positions: ['صانع الألعاب', 'الحارس الهداف', 'الجناح الصغير', 'الجناح القوي', 'المركز'] },
  volleyball: { name: 'الكرة الطائرة', scoreWord: 'نقطة', positions: ['المعد', 'المهاجم الخارجي', 'المهاجم المقابل', 'لاعب الارتكاز', 'الليبرو'] },
  fieldhockey: { name: 'هوكي الميدان', scoreWord: 'هدف', positions: ['حارس المرمى', 'الدفاع', 'الوسط', 'الهجوم'] },
  icehockey: { name: 'هوكي الجليد', scoreWord: 'هدف', positions: ['حارس المرمى', 'المدافع', 'لاعب الوسط', 'الجناح'] },
  floorball: { name: 'فلوربول', scoreWord: 'هدف', positions: ['حارس المرمى', 'الدفاع', 'الوسط', 'الهجوم'] },
};

const templates = makeTemplates(
  {
    intro: 'مرحباً بالجميع وأهلاً بكم[ في مباراة اليوم ضد {opponent}]! إليكم التشكيلة[ الخاصة بفريق {home}]! لنلعب معاً مباراة نزيهة وممتعة!',
    field: 'والآن[ في مركز {position}][، برقم {number}]: {name}! استمتع وقدّم أفضل ما عندك!',
    bench: 'جاهز للنزول من دكة البدلاء: {name}! سعداء بوجودك معنا!',
    score: '{score}[ لفريق {home}]![ أحسنت يا {name}!] رائع، واصل هكذا!',
  },
  sport => sports[sport].scoreWord,
  { football: 'هدااااف' },
);

export const ar = {
  code: 'ar',
  nativeName: 'العربية',
  dir: 'rtl',
  ui: {
    appTitle: 'Sports Caller',
    sportLabel: 'الرياضة',
    languageLabel: 'اللغة',
    step1Title: 'المباراة واللاعبون',
    step1Hint: 'أدخل الفريقين وأضف لاعبيك.',
    step2Title: 'الإعلانات',
    step2Hint: 'اختر ما يقوله المذيع.',
    step3Title: 'اللعبة',
    step3Hint: 'ابدأ المباراة واضغط لإعلان أسماء اللاعبين والأهداف.',
    step4Title: 'الأصوات والصوت',
    step4Hint: 'اختر صوتاً وأصواتاً ممتعة.',
    step5Title: 'الحفظ والخصوصية',
    step5Hint: 'تبقى بياناتك على هذا الجهاز.',
  },
  sports,
  staffHeadings: ['المدرب', 'مساعد المدرب', 'الطاقم', 'مسؤولو الفريق'],
  templates,
} satisfies LanguagePack;
