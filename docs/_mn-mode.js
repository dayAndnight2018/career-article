/* MarkdownNotes 场景模式插件 —— 读取页面 <!-- mn-mode: xxx --> 注释，
   给 .markdown-section 标注 data-mode 并做与桌面端一致的排版增强：
   diary 日记头卡片 / exam 题卡+选项+答案折叠 / essay 论文排版。 */
(function () {
    var COMMENT = /<!--\s*mn-mode:\s*([\w-]+)\s*-->/;
    var COMMENT_ALL = /<!--\s*mn-mode:\s*[\w-]+\s*-->/g;
    // 与桌面端一致：仅识别已知场景，未知标记按 general 处理
    var KNOWN_MODES = { diary: 1, exam: 1, essay: 1 };
    // Markdown 中连续的「日期：/天气：/心情：」行属于同一 <p>（软换行），按段捕获后逐行解析
    var META_LINE_RE = /^(日期|天气|心情|地点|温度|星期|节日|纪念日)[：:]\s*/;

    function parseDate(s) {
        if (!s) return null;
        var m = s.match(/(\d{4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
        var d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }

    // ---------- diary ----------
    function transformDiary(sec) {
        var chips = [], dateRaw = '';
        var kids = [].slice.call(sec.children), i = 0;
        for (; i < kids.length; i++) {
            var el = kids[i];
            if (el.tagName !== 'P') break;
            var lines = el.textContent.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
            if (!lines.length) break;
            var metas = [], ok = true;
            for (var q = 0; q < lines.length; q++) {
                var mm = lines[q].match(META_LINE_RE);
                if (!mm) { ok = false; break; }
                metas.push([mm[1], lines[q].slice(mm[0].length).trim()]);
            }
            if (!ok) break;   // 混有正文行：不是日记头
            metas.forEach(function (kv) {
                if (kv[0] === '日期' || kv[0] === '星期') { if (!dateRaw) dateRaw = kv[1]; }
                else if (kv[0] === '天气' || kv[0] === '心情') chips.push(kv[1]);
                else chips.push(kv[0] + ' · ' + kv[1]);
            });
            el.remove();
        }
        var head = document.createElement('div');
        head.className = 'mn-diary-head';
        var left = document.createElement('div'); left.className = 'dh-left';
        var d = parseDate(dateRaw), hasHead = false;
        if (d) {
            var day = document.createElement('span'); day.className = 'dh-day';
            day.textContent = ('0' + d.getDate()).slice(-2);
            var col = document.createElement('div'); col.className = 'dh-col';
            var ym = document.createElement('span'); ym.className = 'dh-ym';
            ym.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月';
            var wk = document.createElement('span'); wk.className = 'dh-week';
            wk.textContent = '星期' + '日一二三四五六'[d.getDay()];
            col.appendChild(ym); col.appendChild(wk);
            left.appendChild(day); left.appendChild(col);
            hasHead = true;
        } else if (dateRaw) {
            var ym2 = document.createElement('span'); ym2.className = 'dh-ym';
            ym2.textContent = dateRaw;
            left.appendChild(ym2);
            hasHead = true;
        }
        head.appendChild(left);
        if (chips.length) {
            var box = document.createElement('div'); box.className = 'dh-chips';
            chips.forEach(function (c) {
                var chip = document.createElement('span'); chip.className = 'dh-chip';
                chip.textContent = c;
                box.appendChild(chip);
            });
            head.appendChild(box);
            hasHead = true;
        }
        if (hasHead) sec.insertBefore(head, sec.firstChild);
        var h1 = sec.querySelector('h1');
        if (h1) h1.classList.add('diary-title');
    }

    // ---------- exam ----------
    function labelOf(p) {
        var strong = p.querySelector('strong');
        if (!strong) return null;
        var m = strong.textContent.match(/^【([^】]{1,8})】\s*[:：]?\s*/);
        return m ? { label: m[1], strong: strong } : null;
    }
    function tailText(p, strong) {
        var clone = p.cloneNode(true);
        var s = clone.querySelector('strong');
        if (s) s.remove();
        var m = clone.textContent.match(/^\s*[:：]?\s*/);
        return clone.textContent.slice(m ? m[0].length : 0).trim();
    }

    function transformExamCard(card) {
        var h1 = card.querySelector('h1');
        if (h1) {
            var m = h1.textContent.match(/^【([^】]{1,12})】\s*([\s\S]*)$/);
            if (m) {
                var hd = document.createElement('div'); hd.className = 'exam-hd';
                var badge = document.createElement('span'); badge.className = 'exam-badge';
                badge.setAttribute('data-type', m[1]); badge.textContent = m[1];
                hd.appendChild(badge);
                h1.parentNode.insertBefore(hd, h1);
                h1.textContent = m[2];
            }
            h1.classList.add('exam-title');
        }
        [].slice.call(card.children).forEach(function (el) {
            if (el.tagName !== 'P') return;
            var lab = labelOf(el);
            if (!lab) return;
            if (lab.label === '题干') {
                var stem = document.createElement('div'); stem.className = 'exam-stem';
                stem.textContent = tailText(el, lab.strong);
                el.parentNode.replaceChild(stem, el);
            } else if (lab.label === '选项') {
                el.remove();
            }
        });
        // 裸写的选项段落（每行一条「A. xxx」，marked 不把它们当列表）→ 选项卡
        [].slice.call(card.children).forEach(function (el) {
            if (el.tagName !== 'P') return;
            var lines = el.textContent.split(/\n/).map(function (s) { return s.trim(); }).filter(Boolean);
            if (lines.length < 2) return;
            var opts = [], seen = {};
            for (var q = 0; q < lines.length; q++) {
                var pm = lines[q].match(/^([A-H])(?:[.、．:：]|\s)\s*(.+)$/);
                if (!pm || seen[pm[1]]) return;
                seen[pm[1]] = 1;
                opts.push(pm);
            }
            var pbox = document.createElement('div'); pbox.className = 'exam-options';
            opts.forEach(function (o) {
                var row = document.createElement('div'); row.className = 'exam-option';
                row.setAttribute('data-key', o[1]);
                var k = document.createElement('span'); k.className = 'opt-key'; k.textContent = o[1];
                var bd = document.createElement('div'); bd.className = 'opt-body'; bd.textContent = o[2];
                row.appendChild(k); row.appendChild(bd);
                pbox.appendChild(row);
            });
            el.parentNode.replaceChild(pbox, el);
        });
        [].slice.call(card.querySelectorAll('ul')).forEach(function (ul) {
            var lis = [].slice.call(ul.children).filter(function (e) { return e.tagName === 'LI'; });
            if (!lis.length) return;
            if (!/^[A-H](?:[.、．]|\s)/.test(lis[0].textContent.trim())) return;
            var box = document.createElement('div'); box.className = 'exam-options';
            lis.forEach(function (li) {
                var t = li.textContent.trim();
                var row = document.createElement('div'); row.className = 'exam-option';
                var mm = t.match(/^([A-H])(?:[.、．]|\s)\s*([\s\S]*)$/);
                if (mm) {
                    row.setAttribute('data-key', mm[1]);
                    var k = document.createElement('span'); k.className = 'opt-key'; k.textContent = mm[1];
                    var body = document.createElement('div'); body.className = 'opt-body'; body.textContent = mm[2];
                    row.appendChild(k); row.appendChild(body);
                } else {
                    var body2 = document.createElement('div'); body2.className = 'opt-body'; body2.textContent = t;
                    row.appendChild(body2);
                }
                box.appendChild(row);
            });
            ul.parentNode.replaceChild(box, ul);
        });
        // 答案块：首个【答案】段落及其后所有内容 → 折叠卡
        var ps = [].slice.call(card.children), ai = -1;
        for (var j = 0; j < ps.length; j++) {
            if (ps[j].tagName === 'P') {
                var lab = labelOf(ps[j]);
                if (lab && lab.label === '答案') { ai = j; break; }
            }
        }
        if (ai < 0) return;
        var det = document.createElement('details'); det.className = 'exam-key';
        var sum = document.createElement('summary'); sum.textContent = '答案 · 解析';
        det.appendChild(sum);
        var body = document.createElement('div'); body.className = 'exam-key-body';
        det.appendChild(body);
        var letters = '';
        for (var k = ai; k < ps.length; k++) {
            var el = ps[k];
            body.appendChild(el);
            if (el.tagName !== 'P') continue;
            var lab2 = labelOf(el);
            if (!lab2) continue;
            var row = document.createElement('div'); row.className = 'key-row';
            var val = tailText(el, lab2.strong);
            if (lab2.label === '答案') {
                row.classList.add('key-ans');
                letters = val;
            }
            var l = document.createElement('span'); l.className = 'key-label'; l.textContent = lab2.label;
            var v = document.createElement('div'); v.className = 'key-val'; v.textContent = val;
            row.appendChild(l); row.appendChild(v);
            el.parentNode.replaceChild(row, el);
        }
        card.appendChild(det);
        (letters.match(/[A-H]/g) || []).forEach(function (L) {
            var opt = card.querySelector('.exam-option[data-key="' + L + '"]');
            if (opt) opt.setAttribute('data-correct', '1');
        });
    }

    function transformExam(sec) {
        var kids = [].slice.call(sec.children);
        var groups = [[]];
        kids.forEach(function (el) {
            if (el.tagName === 'HR') { el.remove(); groups.push([]); }
            else groups[groups.length - 1].push(el);
        });
        groups.forEach(function (g) {
            if (!g.length) return;
            var card = document.createElement('div'); card.className = 'exam-card';
            sec.insertBefore(card, g[0]);
            g.forEach(function (el) { card.appendChild(el); });
            transformExamCard(card);
        });
    }

    // ---------- essay ----------
    function transformEssay(sec) {
        var h1 = sec.querySelector('h1');
        if (h1) h1.classList.add('essay-title');
        [].slice.call(sec.children).some(function (el) {
            if (el.tagName !== 'H2') return false;
            if (/^\s*—/.test(el.textContent)) {
                // 副标题只剩破折号（模板删空后的 “## ——”）视为没有副标题：整段移除，不占位
                if (!el.textContent.replace(/[\s—]/g, '')) { el.remove(); return false; }
                el.classList.add('essay-subtitle'); return true;
            }
            return false;
        });
    }

    // ---------- 静态页「导出 PDF」修正版（截图与所见渲染一致） ----------
    // 旧版导出按钮：截图前强制 .markdown-section 794px 宽，并以内容宽充当克隆视口宽 ——
    // 克隆文档按窄视口重排（侧边栏挤占内容列），导出结果与屏幕所见不一致；
    // 分页吸附还可能选中页界下方的元素边界，切片超出一页高而被页底裁切。
    // 修正：不干预布局（仅关装饰阴影）、不覆盖克隆视口、A4 比例按实际画布宽计算、
    // 分页只向上吸附（内容整体后移，切片永不超页）。_mn-mode.js 随站点资源全量同步，
    // 按钮重绑到本实现 —— 既有站点无需重建即可获得修正。
    window.mnExportPdf = function (btn) {
        var content = document.querySelector('.markdown-section');
        if (!content) { alert('未找到要导出的内容'); return; }
        if (typeof html2canvas === 'undefined' || !window.jspdf) {
            alert('导出组件未加载（html2canvas / jsPDF），请检查网络后刷新重试');
            return;
        }
        var orig = btn.innerHTML;
        btn.disabled = true; btn.innerHTML = '⏳ 正在生成图片版PDF...';
        // 导出期间的最小干预：只关页面装饰阴影、限制图片溢出 —— 不改变布局，截到即所见
        var pdfStyle = document.createElement('style');
        pdfStyle.id = 'pdf-font-style';
        pdfStyle.textContent = '.markdown-section{box-shadow:none!important}'
            + ' img{max-width:100%!important;height:auto!important}';
        document.head.appendChild(pdfStyle);
        var done = function () {
            var s = document.getElementById('pdf-font-style');
            if (s && s.parentNode) s.parentNode.removeChild(s);
            btn.innerHTML = orig; btn.disabled = false;
        };
        // 超长文档防 canvas 单边尺寸上限（约 32000px）：按内容高度自适应精度
        var scale = content.scrollHeight * 3 > 32000
            ? Math.max(1, Math.floor(32000 / content.scrollHeight)) : 3;
        html2canvas(content, {
            scale: scale,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
            // 刻意不覆盖 windowWidth/windowHeight：克隆文档按真实视口布局，截图与所见一致
        }).then(function (canvas) {
            var totalH = canvas.height;
            var pageH = Math.round(canvas.width * 297 / 210);   // A4 210:297，按实际画布宽
            // 收集块级元素底边：分页断点吸附到元素边界，避免文字被拦腰截断
            var contentRect = content.getBoundingClientRect();
            var bounds = [];
            for (var ci = 0; ci < content.children.length; ci++) {
                var cr = content.children[ci].getBoundingClientRect();
                bounds.push(cr.bottom - contentRect.top);
            }
            // 只向上吸附（分页提前、内容后移）—— 切片不超过一页高，绘制不溢出页底
            var breaks = [0];
            var next = pageH;
            while (next < totalH) {
                var bestY = next, bestDist = Infinity;
                for (var bi = 0; bi < bounds.length; bi++) {
                    var sb = bounds[bi] * scale;
                    if (sb <= next && sb > breaks[breaks.length - 1] + 4
                        && next - sb < pageH * 0.3 && next - sb < bestDist) {
                        bestDist = next - sb; bestY = sb;
                    }
                }
                breaks.push(bestY);
                next = bestY + pageH;
            }
            breaks.push(totalH);

            var pdf = new window.jspdf.jsPDF('p', 'mm', 'a4');
            var pageMM = pdf.internal.pageSize.getWidth();
            for (var i = 0; i < breaks.length - 1; i++) {
                var sliceH = breaks[i + 1] - breaks[i];
                if (sliceH <= 0) continue;
                if (i > 0) pdf.addPage();
                var slice = document.createElement('canvas');
                slice.width = canvas.width; slice.height = sliceH;
                slice.getContext('2d').drawImage(canvas,
                    0, breaks[i], canvas.width, sliceH,
                    0, 0, canvas.width, sliceH);
                var sliceMM = sliceH * pageMM / canvas.width;   // 按页宽等比铺放，保持纵横比
                pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pageMM, sliceMM);
                if (i > 100) { alert('文档内容过多，已自动截断。建议分章节导出以获得完整内容。'); break; }
            }
            pdf.save('职业考试笔记-图片版.pdf');
            done();
        }).catch(function (err) {
            console.error('PDF生成错误:', err);
            done();
            alert('PDF导出失败：' + ((err && err.message) || '未知错误') + '\n请重试。');
        });
    };

    // 把导出按钮重绑到修正版流程（幂等：带 data-mn-pdf 标记的跳过；
    // 克隆替换原按钮 —— 旧监听随旧节点一起丢弃，对既有站点生效）
    function mnBindPdfButton(btn) {
        if (!btn || btn.getAttribute('data-mn-pdf')) return;
        btn.setAttribute('data-mn-pdf', '1');
        var fixed = btn.cloneNode(true);
        fixed.addEventListener('click', function (e) {
            e.preventDefault();
            window.mnExportPdf(fixed);
        });
        if (btn.parentNode) btn.parentNode.replaceChild(fixed, btn);
    }

    function mnBindAllPdfButtons() {
        var btns = document.querySelectorAll('.image-pdf-btn:not([data-mn-pdf])');
        for (var i = 0; i < btns.length; i++) mnBindPdfButton(btns[i]);
    }

    if (document.body) {
        mnBindAllPdfButtons();
        // 控制面板按钮在页面切换后重建 —— 监听插入即时重绑
        if (window.MutationObserver)
            new MutationObserver(mnBindAllPdfButtons).observe(document.body, { childList: true, subtree: true });
    }

    window.$docsify = window.$docsify || {};
    var plugin = function (hook, vm) {
        hook.afterEach(function (html) {
            var m = html.match(COMMENT);
            vm.__mnMode = (m && KNOWN_MODES[m[1]]) ? m[1] : 'general';
            // 清除页面里全部模式注释（多处标记也不残留到渲染结果）
            return html.replace(COMMENT_ALL, '');
        });
        hook.doneEach(function () {
            mnBindAllPdfButtons();   // 每页渲染后兜底重绑（按钮由模板脚本延迟创建）
            var sec = document.querySelector('.markdown-section');
            if (!sec) return;
            var mode = vm.__mnMode || 'general';
            // general 不标注属性（与桌面端一致，避免命中 [data-mode] 通配规则）
            if (mode === 'general') { sec.removeAttribute('data-mode'); return; }
            sec.setAttribute('data-mode', mode);
            try {
                if (mode === 'diary') transformDiary(sec);
                else if (mode === 'exam') transformExam(sec);
                else if (mode === 'essay') transformEssay(sec);
            } catch (e) { console.error('[mn-mode] transform failed:', e); }
        });
    };
    window.$docsify.plugins = (window.$docsify.plugins || []).concat(plugin);
})();