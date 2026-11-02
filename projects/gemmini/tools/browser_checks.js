async (page) => {
  const results=[];
  const check=(value,name)=>{if(!value)throw new Error(name);results.push(name);};
  const text=async selector=>page.locator(selector).textContent();
  const initial=await page.evaluate(()=>({chapters:document.querySelectorAll('.chapter').length,lessons:document.querySelectorAll('.lesson').length,concepts:document.querySelectorAll('.concept').length,quiz:document.querySelectorAll('.quiz').length,overflow:document.documentElement.scrollWidth>innerWidth}));
  check(initial.chapters===22&&initial.lessons===90&&initial.concepts===40&&initial.quiz===20,'course, concepts and quizzes render');check(!initial.overflow,'desktop has no horizontal overflow');
  await page.getByRole('tab',{name:'阵列与 PE',exact:true}).click();await page.locator('.arch-node[data-module="pe"]').click();check((await text('#module-detail')).includes('PE'),'PE architecture selection');
  await page.locator('#module-detail .source-ref').first().click();check(await page.locator('#code-dialog').isVisible(),'code dialog opens from source reference');
  await page.locator('#code-line').fill('70');await page.locator('#code-go').click();check(await page.locator('#line-70').isVisible(),'source line navigation');
  await page.locator('#code-query').fill('c1');await page.locator('#code-find').click();check((await page.locator('.code-line.target').textContent()).includes('c1'),'file text search');await page.locator('[data-close="code-dialog"]').click();
  await page.locator('#flow-select').selectOption('gemm');await page.locator('#flow-next').click();check((await text('#flow-detail')).includes('STEP 2'),'flow advances');await page.locator('#flow-reset').click();
  await page.locator('[data-lab="systolic"]').click();for(let i=0;i<7;i++)await page.locator('#sys-step').click();check(await page.locator('#sys-step').isDisabled(),'OS reaches final cycle');
  await page.locator('#sys-mode').selectOption('ws');for(let i=0;i<7;i++)await page.locator('#sys-step').click();check(await page.locator('#sys-step').isDisabled(),'WS reaches final cycle');
  await page.locator('[data-lab="scheduler"]').click();for(let i=0;i<30&&!(await page.locator('#sched-step').isDisabled());i++)await page.locator('#sched-step').click();check((await page.locator('.status-done').count())===7,'all scheduled commands complete');
  await page.locator('[data-lab="memory"]').click();await page.locator('#mem-row').fill('4096');await page.locator('#mem-row').press('Tab');check((await text('.memory-bank.selected')).includes('BANK 1'),'address bank boundary');
  await page.locator('[data-lab="noc"]').click();await page.locator('#noc-start').selectOption('3');await page.locator('#noc-end').selectOption('12');check(await page.locator('.router.on').count()===7,'XY route rendered');
  await page.locator('[data-lab="directory"]').click();await page.locator('[data-dir-event="write"][data-core="0"]').click();check((await text('.directory-cards')).includes('BUSY'),'directory holds request waiting for data');await page.locator('[data-dir-event="data"]').click();await page.locator('[data-dir-event="write"][data-core="1"]').click();await page.locator('[data-dir-event="ack"][data-core="1"]').click();check((await text('.directory-cards')).includes('ACK [0]'),'wrong ACK does not grant');await page.locator('[data-dir-event="ack"][data-core="0"]').click();check((await text('.directory-cards')).includes('BUSY'),'waits for data even after ACK');await page.locator('[data-dir-event="data"]').click();check((await text('.directory-cards')).includes('Owner: 1'),'directory transfers owner');
  await page.locator('[data-lab="config"]').click();check((await text('.config-results')).includes('4096'),'default capacity calculator');
  await page.locator('#course-query').fill('双缓冲');check(await page.locator('#chapters .chapter').count()>0,'course filtering');await page.locator('#course-query').fill('');
  await page.locator('.chapter').first().locator('summary').first().click();await page.locator('[data-read]').first().click();check((await text('#read-count')).startsWith('1 /'),'reading marker updates');
  await page.locator('#concept-query').fill('directory');check(await page.locator('.concept').count()>0,'concept filtering');await page.locator('#concept-query').fill('');
  await page.locator('#source-query').fill('PE.scala');check((await text('#source-count')).startsWith('1 个文件'),'source path filter');await page.locator('#source-results .source-row').click();check((await text('#code-title')).endsWith('PE.scala'),'source browser opens file');await page.locator('[data-close="code-dialog"]').click();
  await page.locator('#source-query').fill('');
  const answer=await page.evaluate(()=>window.GSOFTWARE.quizzes[1].answer);await page.locator(`[data-quiz="1"][data-option="${answer}"]`).click();check(await page.locator('.quiz').nth(1).locator('.quiz-feedback').count()===1,'quiz feedback and rotated answer');await page.locator('#quiz-reset').click();
  await page.locator('#notes-open').click();await page.locator('#notes-text').fill('浏览器验证：从接口到状态，再到不变量。');await page.locator('[data-close="notes-dialog"]').click();
  await page.locator('[data-search-open]').first().click();await page.locator('#global-query').fill('DMA');check(await page.locator('.search-result').count()>0,'global search results');await page.locator('[data-close="search-dialog"]').click();
  await page.reload();check((await text('#read-count')).startsWith('1 /'),'reading state survives reload');await page.locator('#notes-open').click();check((await page.locator('#notes-text').inputValue()).includes('浏览器验证'),'notes survive reload');await page.locator('[data-close="notes-dialog"]').click();
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));check(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'mobile has no page overflow');
  await page.locator('#menu-toggle').click();check(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')),'mobile menu opens');await page.locator('#sidebar a[href="#laboratory"]').click();check(!(await page.locator('#sidebar').evaluate(el=>el.classList.contains('open'))),'mobile menu closes after navigation');
  await page.locator('[data-lab="directory"]').click();check(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'mobile directory has no page overflow');
  await page.locator('#laboratory').scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/lab-mobile.png'});
  await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.screenshot({path:'output/playwright/hero-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});await page.locator('#atlas').scrollIntoViewIfNeeded();await page.screenshot({path:'output/playwright/atlas-desktop.png'});
  // Remove smoke-test progress and notes so normal reading starts clean.
  await page.evaluate(()=>['read','answers','notes'].forEach(k=>localStorage.removeItem('gemmini:'+k)));
  await page.reload();
  return {passed:true,checks:results.length,results,viewports:['1440×1000','390×844']};
}
