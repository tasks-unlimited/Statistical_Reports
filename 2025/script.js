/**
 * script.js
 * Asynchronously fetches CSV data from a published Google Sheet,
 * parses it, and dynamically populates the HTML document based on Unique_IDs.
 */

// MASTER_SHEET_URL is now globally defined in update_link_here.js

// IDs that should animate like rolling odometers
const kineticIds = ['number_of_individuals_supported', 'number_of_one', 'number_of_two', 'number_of_three', 'number_of_four', 'number_of_new_enrollments_from_outside_tasks'];

// Config for dynamically generated Donut Charts
const donutChartsConfig = [
    { id: 'gender_table', gid: '1957671731', type: 'doughnut' },
    { id: 'age_table', gid: '1072935215', type: 'pie' },
    { id: 'education_table', gid: '1185639058', type: 'bar' },
    { id: 'race_table', gid: '1563602712', type: 'pie' },
    { id: 'primary_table', gid: '824597336', type: 'polarArea' }
];

document.addEventListener("DOMContentLoaded", async () => {
    try {
        // Fetch main text_blocks data using the URL from update_link_here.js
        const response = await fetch(MASTER_SHEET_URL);
        if (!response.ok) {
            throw new Error(`Failed to fetch data. HTTP Status: ${response.status}`);
        }
        
const csvString = await response.text();
        const dataObjects = parseCSV(csvString);
        populateDOM(dataObjects);

        // Fetch and render donut charts concurrently from the other tabs
        await fetchAndRenderDonuts();

        // Hide the pure white preloader now that the layout is fully expanded
        const preloader = document.getElementById('page-preloader');
        if (preloader) {
            preloader.classList.add('is-hidden');
            setTimeout(() => preloader.remove(), 600);
        }

// NOW initialize the observer so it correctly calculates viewport positions
        document.querySelectorAll('.animate-in, .kinetic-num').forEach(el => observer.observe(el));

        // Automatically route external links to a new tab
        document.querySelectorAll('a').forEach(link => {
            const href = link.getAttribute('href');
            // If it's a web link (http) but NOT an internal jump link (#)
            if (href && (href.startsWith('http') || href.startsWith('//'))) {
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            }
        });
        
    } catch (error) {
        console.error("Error initializing dynamic content:", error);
        // Hide preloader even on error to prevent indefinite white screen
        const preloader = document.getElementById('page-preloader');
        if (preloader) preloader.classList.add('is-hidden');
    }
});

/**
 * Fetch secondary tabs and render Chart.js Donut Charts
 */
async function fetchAndRenderDonuts() {
    // Pull colors directly from the CSS variables to ensure brand continuity
    const rootStyles = getComputedStyle(document.documentElement);
    const chartColors = [
        rootStyles.getPropertyValue('--navy').trim(),
        rootStyles.getPropertyValue('--orange').trim(),
        rootStyles.getPropertyValue('--teal').trim(),
        rootStyles.getPropertyValue('--orange-light').trim(),
        rootStyles.getPropertyValue('--teal-light').trim(),
        rootStyles.getPropertyValue('--mid-gray').trim(),
        rootStyles.getPropertyValue('--navy-light').trim(),
        rootStyles.getPropertyValue('--warm-gray').trim()
    ];

    const fetchPromises = donutChartsConfig.map(async (chart) => {
        // Strip the Master GID and append the specific chart tab GID
        const baseUrl = MASTER_SHEET_URL.split('&gid=')[0];
        const chartUrl = `${baseUrl}&gid=${chart.gid}&single=true`;
        
        try {
            const res = await fetch(chartUrl);
            if (!res.ok) throw new Error(`Failed to fetch gid ${chart.gid}`);
            const csvStr = await res.text();
            
            // Leverage your existing CSV parser to safely handle strings with commas
            const parsedData = parseCSV(csvStr);
            const labels = [];
            const data = [];
            
            parsedData.forEach(row => {
                const keys = Object.keys(row);
                if (keys.length >= 2) {
                    const label = row[keys[0]];
                    const valueStr = row[keys[1]] || '0';
                    
                    // Exclude any totals row from becoming a graph slice
                    if (label.toLowerCase() !== 'total' && !label.toLowerCase().includes('total number')) {
                        labels.push(label);
                        // Strip out percentages and commas, parse to a float
                        data.push(parseFloat(valueStr.replace(/%/g, '').replace(/,/g, '')));
                    }
                }
            });
            
            const container = document.getElementById(chart.id);
            if (container) {
                // Clear any existing markdown tables generated by populateDOM and inject canvas
                container.innerHTML = '<canvas></canvas>';
                const ctx = container.querySelector('canvas').getContext('2d');
                
                new Chart(ctx, {
                    type: chart.type || 'doughnut',
                    data: {
                        labels: labels,
                        datasets: [{
                            data: data,
                            backgroundColor: chartColors,
                            borderWidth: 2,
                            borderColor: rootStyles.getPropertyValue('--white').trim(),
                            hoverOffset: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'bottom',
                                labels: {
                                    font: { family: "'Open Sans', sans-serif", size: 12 },
                                    color: rootStyles.getPropertyValue('--warm-gray').trim(),
                                    padding: 15,
                                    usePointStyle: true,
                                }
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        // Calculate the true percentage dynamically
                                        const total = context.dataset.data.reduce((acc, curr) => acc + curr, 0);
                                        const percentage = Math.round((context.raw / total) * 100);
                                        
                                        // Display: "Label: Count (Percentage%)"
                                        return ` ${context.label}: ${context.raw} (${percentage}%)`;
                                    }
                                }
                            }
                        },
                        // Only hollow out the center if it is NOT a pie chart
                        cutout: chart.type === 'pie' ? '0%' : '65%'
                    }
                });
                
                // Add flexible dimensions to the container to ensure perfect mobile responsiveness
                container.style.position = 'relative';
                container.style.width = '100%';
                container.style.aspectRatio = '1 / 1';
                container.style.maxHeight = '320px';
                container.style.marginTop = '15px';
                container.style.display = 'flex';
                container.style.justifyContent = 'center';
            }
        } catch (err) {
            console.error(`Error processing chart ${chart.id}:`, err);
        }
    });

    // Run all fetches concurrently
    await Promise.all(fetchPromises);
}

/**
 * 2. CSV Parsing Logic
 */
function parseCSV(csvText) {
    const rows = [];
    let row = [];
    let currentStr = '';
    let insideQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
        const char = csvText[i];
        const nextChar = csvText[i + 1];

        if (char === '"' && insideQuotes && nextChar === '"') {
            currentStr += '"'; 
            i++; 
        } else if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === ',' && !insideQuotes) {
            row.push(currentStr);
            currentStr = '';
        } else if ((char === '\n' || char === '\r') && !insideQuotes) {
            if (char === '\r' && nextChar === '\n') i++; 
            row.push(currentStr);
            if (row.length > 0 || currentStr !== '') rows.push(row);
            row = [];
            currentStr = '';
        } else {
            currentStr += char;
        }
    }
    
    if (row.length > 0 || currentStr !== '') {
        row.push(currentStr);
        rows.push(row);
    }

    if (rows.length < 2) return [];

    const headers = rows[0].map(h => h.trim());
    const dataObjects = [];

    for (let i = 1; i < rows.length; i++) {
        if (rows[i].length === 1 && rows[i][0].trim() === '') continue; 
        
        const obj = {};
        for (let j = 0; j < headers.length; j++) {
            obj[headers[j]] = rows[i][j] ? rows[i][j].trim() : '';
        }
        dataObjects.push(obj);
    }

    return dataObjects;
}

/**
 * 3. Data-to-DOM Mapping (Pure Sequential Architecture)
 */
function populateDOM(data) {
    const dynamicContainer = document.getElementById('dynamic-content-container');
    let isDynamicZone = false;
    
    let activeSectionWrapper = null;
    let activeCard = null;
    let activeIndexDropdown = null;
    let activeIndexToc = null;
    
    let activeTable = null;
    let activeTableParent = null; 
    let activeTr = null;

    // Palette for Dynamic Banners
    const sectionStyles = {
        'section1': 'background: linear-gradient(135deg, var(--navy) 0%, #1a3a5c 100%);',
        'section2': 'background: linear-gradient(135deg, var(--teal) 0%, #2a8a8f 100%);',
        'section3': 'background: linear-gradient(135deg, var(--orange) 0%, #d4551b 100%);',
        'section4': 'background: linear-gradient(135deg, var(--navy) 0%, var(--teal) 100%);',
        'section5': 'background: linear-gradient(135deg, var(--navy) 0%, var(--orange) 100%);'
    };

    // Helper: Format raw text or list elements
    function formatText(el, type, content) {
        if (type === 'ul' || type === 'ol') {
            const listItems = content.split('\n').filter(line => line.trim() !== '');
            listItems.forEach(liText => {
                const li = document.createElement('li');
                li.innerHTML = liText.replace(/^[-*+]\s|^\d+\.\s/, ''); 
                el.appendChild(li);
            });
        } else {
            el.innerHTML = content ? content.replace(/^#+\s/, '') : '';
        }
    }

    data.forEach(item => {
        const { Unique_ID, Element_Type, Content_Body } = item;
        if (!Unique_ID) return;

        let rawType = (Element_Type || '').toLowerCase();
        let isFancy = false;
        if (rawType.startsWith('fancy')) {
            isFancy = true;
            rawType = rawType.replace('fancy', '');
        }

        // --- 1. GLOBAL INTERCEPTS (Top Nav Banners & Hardcoded Hooks) ---
        
        if (Unique_ID === 'client_satisfaction_qr_code') {
            const qrImg = document.getElementById('client_satisfaction_qr_img');
            if (qrImg && Content_Body.trim() !== '') qrImg.src = Content_Body.trim();
            return;
        }

        // Always intercept section1-5 dynamically from ANYWHERE in the sheet
        if (sectionStyles[rawType]) {
            const cleanTitle = Content_Body ? Content_Body.replace(/^#+\s/, '').trim() : 'Section';
            
            // Generate the dynamic Top Nav Pill Button
            const topNavContainer = document.getElementById('dynamic-top-nav-links');
            if (topNavContainer) {
                const navBtn = document.createElement('a');
                navBtn.href = '#' + Unique_ID;
                navBtn.innerText = cleanTitle;
                navBtn.style = sectionStyles[rawType] + ' color: var(--white); border: none;';
                topNavContainer.appendChild(navBtn);
            }

            if (!isDynamicZone) {
                // Before dynamic mode: Drop invisible anchor to keep Hero clean
                const anchor = document.createElement('div');
                anchor.id = Unique_ID;
                anchor.style = 'position: absolute; top: 0;'; 
                document.body.prepend(anchor);
                return; // Suppress giant banner
            } else {
                // Inside dynamic mode: Generate the giant print-friendly banner
                activeSectionWrapper = document.createElement('div');
                activeSectionWrapper.style.position = 'relative'; 
                dynamicContainer.appendChild(activeSectionWrapper);
                
                // Clear the trackers so they don't bleed
                activeIndexDropdown = null;
                activeIndexToc = null;
                activeCard = null; 

                const banner = document.createElement('div');
                banner.className = 'print-page-break animate-in delay-1';
                banner.style = `${sectionStyles[rawType]} padding: 30px 24px; border-radius: 20px; margin: 40px 0 32px; text-align: center; box-shadow: 0 8px 24px rgba(36,72,118,0.25);`;
                
                const title = document.createElement('h2');
                title.id = Unique_ID;
                title.style = 'font-size: 36px; color: var(--white); margin-bottom: 0; font-weight: 800; letter-spacing: 1px; border:none;';
                title.innerHTML = cleanTitle;
                
                banner.appendChild(title);
                activeSectionWrapper.appendChild(banner);
                return;
            }
        }

        // --- 2. DYNAMIC ZONE MARKER ---
        if (Unique_ID === 'begin_dynamic_building_mode') {
            isDynamicZone = true;
            return;
        }

        // --- 3. HARDCODED ELEMENTS ---
        if (!isDynamicZone || document.getElementById(Unique_ID)) {
            let existingElement = document.getElementById(Unique_ID);
            if (!existingElement) return;

            if (isFancy) existingElement.classList.add('fancy-style');

            if (kineticIds.includes(Unique_ID)) {
                const text = Content_Body.trim();
                existingElement.setAttribute('data-target-text', text);
                const matches = text.match(/^([^0-9]*)([0-9,.]+)([^0-9]*)$/);
                if (matches) {
                    existingElement.setAttribute('data-prefix', matches[1]);
                    existingElement.setAttribute('data-num', matches[2].replace(/,/g, ''));
                    existingElement.setAttribute('data-suffix', matches[3]);
                    existingElement.innerText = `${matches[1]}0${matches[3]}`; 
                    existingElement.classList.add('kinetic-num');
                } else {
                    existingElement.innerHTML = text;
                }
                return;
            }

            const standardTypes = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'br', 'hr', 'nav', 'aside', 'blockquote', 'dl', 'dt', 'dd'];
            const trimmedBody = Content_Body ? Content_Body.trim() : '';
            
            const isImage = rawType === 'img' || (trimmedBody.length < 500 && trimmedBody.match(/\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i));
            
            const protectedIds = ['top_nav_button_1', 'top_nav_button_2', 'top_nav_button_3', 'title', 'top_nav_text'];

            if (standardTypes.includes(rawType) && existingElement.tagName.toLowerCase() !== rawType && !protectedIds.includes(Unique_ID)) {
                const newElement = document.createElement(rawType);
                Array.from(existingElement.attributes).forEach(attr => newElement.setAttribute(attr.name, attr.value));
                existingElement.replaceWith(newElement);
                existingElement = newElement;
            }

            if (isImage) {
                if (existingElement.tagName.toLowerCase() === 'img') {
                    existingElement.src = trimmedBody;
                } else {
                    existingElement.innerHTML = `<img src="${trimmedBody}" alt="Graphic" style="max-height: 180px; display: block; margin: 0 auto 12px auto;">`;
                }
            } else if (standardTypes.includes(rawType)) {
                existingElement.innerHTML = Content_Body ? Content_Body.replace(/^#+\s/, '') : '';
            } else if (rawType === 'table') {
                if (Unique_ID === 'enrollment_by_county_table') {
                    existingElement.innerHTML = parseBarChart(Content_Body);
                } else if (Unique_ID === 'number_of_enrollments_table') {
                    existingElement.innerHTML = parseProgList(Content_Body);
                } else {
                    existingElement.innerHTML = parseMarkdownTable(Content_Body);
                }
            } else if (rawType === 'ul' || rawType === 'ol') {
                existingElement.innerHTML = ''; 
                formatText(existingElement, rawType, Content_Body);
            } else {
                existingElement.innerHTML = Content_Body || '';
            }
            
            if (!isDynamicZone) return;
        }

        // --- 4. THE DYNAMIC BRAIN (Pure Sequential Architecture) ---
        if (isDynamicZone && dynamicContainer) {
            
            if (!activeSectionWrapper) {
                activeSectionWrapper = document.createElement('div');
                activeSectionWrapper.style.position = 'relative';
                dynamicContainer.appendChild(activeSectionWrapper);
            }

            // --- A. The Sweeping Index ---
            if (rawType === 'index') {
                const indexCard = document.createElement('div');
                indexCard.className = 'card glossary-index-card animate-in delay-2';
                indexCard.style = 'position: sticky; top: var(--sticky-offset); z-index: 45; padding: 22px; margin-top: 0; background: rgba(255, 255, 255, 0.5); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: 0 10px 30px rgba(36,72,118,0.12); margin-bottom: 30px;';
                
                const titleDiv = document.createElement('div');
                titleDiv.className = 'card-title';
                titleDiv.style = 'border:none; margin:0; text-align:center; padding-bottom: 15px;';
                titleDiv.innerText = Content_Body ? Content_Body.replace(/^#+\s/, '') : 'Section Index';
                indexCard.appendChild(titleDiv);

                const dropWrap = document.createElement('div');
                dropWrap.className = 'glossary-dropdown-wrap';
                
                const select = document.createElement('select');
                select.className = 'dynamic-dropdown';
                select.style = 'width: 100%; max-width: 400px; padding: 12px 16px; font-family: Montserrat, sans-serif; font-size: 14px; font-weight: 600; color: var(--navy); background-color: var(--white); border: 1px solid var(--light-gray); border-radius: var(--radius-sm); cursor: pointer; text-align: center;';
                
                const defaultOpt = document.createElement('option');
                defaultOpt.value = '';
                defaultOpt.innerText = 'Select a Topic...';
                select.appendChild(defaultOpt);
                
                select.addEventListener('change', (e) => {
                    const targetId = e.target.value;
                    if (targetId) {
                        const targetEl = document.getElementById(targetId);
                        if (targetEl) {
                            const yOffset = -240; 
                            const y = targetEl.getBoundingClientRect().top + window.scrollY + yOffset;
                            window.scrollTo({top: y, behavior: 'smooth'});
                        }
                        select.selectedIndex = 0;
                    }
                });

                dropWrap.appendChild(select);
                indexCard.appendChild(dropWrap);
                
                const tocWrap = document.createElement('div');
                tocWrap.className = 'glossary-toc-wrap print-toc';
                const tocUl = document.createElement('ul');
                tocUl.style = 'list-style-type: none; margin: 0; padding: 0;';
                tocWrap.appendChild(tocUl);
                indexCard.appendChild(tocWrap);

                activeSectionWrapper.appendChild(indexCard);
                
                // Arm the index tracking radar
                activeIndexDropdown = select;
                activeIndexToc = tocUl;
                activeCard = null; 
                return;
            }

            // --- B. Floating H1 vs White Card H2 Architecture ---
            const isHeader = rawType === 'h1' || rawType === 'h2';
            
            if (rawType === 'h1') {
                // H1 triggers a background float (breaks out of cards)
                activeCard = null; 
                activeTable = null;
            } else if (rawType === 'h2') {
                // H2 triggers a brand new crisp white card
                activeCard = document.createElement('div');
                activeCard.className = 'card animate-in delay-2';
                activeSectionWrapper.appendChild(activeCard);
                activeTable = null; 
            }

            // --- C. Core Content Population ---
            const tableParts = ['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th'];
            const textGroup = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'div', 'span', 'blockquote', 'ul', 'ol', 'li', 'hr', 'br', 'a', 'strong', 'em'];
            const trimmedBody = Content_Body ? Content_Body.trim() : '';
            const isImage = rawType === 'img' || (!rawType && trimmedBody.length < 500 && trimmedBody.match(/\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i));

            if (tableParts.includes(rawType)) {
                if (rawType === 'table') {
                    if (Content_Body && Content_Body.includes('|')) {
                        const tempWrap = document.createElement('div');
                        tempWrap.innerHTML = parseMarkdownTable(Content_Body);
                        if (tempWrap.firstElementChild) {
                            const generatedTable = tempWrap.firstElementChild.querySelector('table');
                            if (generatedTable) generatedTable.id = 'table_' + Unique_ID;
                            if (activeCard) activeCard.appendChild(tempWrap.firstElementChild);
                            else activeSectionWrapper.appendChild(tempWrap.firstElementChild);
                        }
                    } else {
                        const el = document.createElement('table');
                        el.id = 'table_' + Unique_ID;
                        el.className = 'glossary-table';
                        const wrap = document.createElement('div');
                        wrap.className = 'glossary-table-wrap';
                        wrap.appendChild(el);
                        
                        if (activeCard) activeCard.appendChild(wrap);
                        else activeSectionWrapper.appendChild(wrap);
                        
                        activeTable = el;
                        activeTableParent = el;
                    }
                    return;
                }

                const el = document.createElement(rawType);
                el.id = Unique_ID;
                if (!activeTable) return;
                
                if (rawType === 'tfoot' && Content_Body && !Content_Body.includes('<tr')) {
                    el.innerHTML = `<tr><td colspan="100%" style="font-size: 12.5px; padding-top: 12px; border-bottom: none; color: var(--mid-gray);">${Content_Body.replace(/^#+\s/, '')}</td></tr>`;
                } else {
                    el.innerHTML = Content_Body || '';
                }

                if (['thead', 'tbody', 'tfoot'].includes(rawType)) {
                    activeTable.appendChild(el);
                    activeTableParent = el;
                } else if (rawType === 'tr') {
                    (activeTableParent || activeTable).appendChild(el);
                    activeTr = el;
                } else if (['td', 'th'].includes(rawType)) {
                    if (activeTr) activeTr.appendChild(el);
                }
                return;
            }

            if (textGroup.includes(rawType) || isImage) {
                const elementTag = isImage ? 'div' : rawType;
                const el = document.createElement(elementTag);
                el.id = Unique_ID;
                if (isFancy) el.classList.add('fancy-style');

                // Track H1 and H2s in the Active Section Index (Skip if Content_Body is empty)
                if (isHeader && activeIndexDropdown && Content_Body && Content_Body.trim() !== '') {
                    const cleanTitle = Content_Body.replace(/^#+\s/, '').trim();
                    const opt = document.createElement('option');
                    opt.value = Unique_ID;
                    opt.innerText = cleanTitle;
                    activeIndexDropdown.appendChild(opt);

                    const li = document.createElement('li');
                    li.style = 'margin-bottom: 8px; border-bottom: 1px dashed var(--light-gray); padding-bottom: 4px;';
                    li.innerHTML = `<a href="#${Unique_ID}" style="text-decoration: none; color: var(--navy); font-weight: 600; font-size: 14px;">${cleanTitle}</a>`;
                    activeIndexToc.appendChild(li);
                }

                if (isHeader && rawType !== 'h1') {
                    el.className = 'card-title';
                    el.style.border = 'none';
                    el.style.marginBottom = '0';
                }

                if (rawType === 'h1') {
                    // Give floating H1s an entrance animation
                    el.classList.add('animate-in', 'delay-2');
                }

                if (isImage) {
                    el.innerHTML = `<img src="${trimmedBody}" alt="Graphic" style="max-width: 100%; height: auto; border-radius: 8px; margin: 15px 0; display: block;">`;
                } else if (['ul', 'ol'].includes(elementTag) && Content_Body && Content_Body.includes('\n')) {
                    formatText(el, elementTag, Content_Body);
                } else if (!['hr', 'br'].includes(elementTag)) {
                    el.innerHTML = Content_Body ? Content_Body.replace(/^#+\s/, '') : '';
                }

                if (activeCard) {
                    activeCard.appendChild(el);
                } else {
                    // Floating items get slight padding to snap to the grid beautifully
                    el.style.padding = '0 12px';
                    activeSectionWrapper.appendChild(el);
                }
            }
        }
    });
}

/**
 * Custom UI Parser: CSS Horizontal Bar Chart
 */
function parseBarChart(mdText) {
    const rows = mdText.trim().split('\n').filter(r => !r.match(/^[|\s:\-]+$/));
    if (rows.length < 2) return '';
    
    const data = [];
    let total = 0;
    
    // Extract data skipping the header row
    for (let i = 1; i < rows.length; i++) {
        let cleanRow = rows[i].trim().replace(/^\||\|$/g, '');
        const cols = cleanRow.split('|').map(c => c.trim());
        if (cols.length >= 2) {
            const label = cols[0];
            const value = parseFloat(cols[1].replace(/,/g, ''));
            // Exclude totals row from being graphed
            if (!isNaN(value) && label.toLowerCase() !== 'total' && !label.toLowerCase().includes('total number')) {
                data.push({ label, value });
                total += value;
            }
        }
    }
    
    // Sort visually descending
    data.sort((a, b) => b.value - a.value);
    const colors = ['var(--orange)', 'var(--teal)', 'var(--orange-light)', 'var(--teal-light)', '#3faae4', 'var(--mid-gray)'];
    
    let html = '<div style="padding-top:4px;">\n';
    data.forEach((item, index) => {
        const pct = total > 0 ? (item.value / total * 100).toFixed(1) : 0;
        const color = colors[index % colors.length];
        html += `
        <div class="bar-row">
            <div class="bar-label">${item.label}</div>
            <div class="bar-track" style="overflow: visible;">
                <div class="bar-fill" style="width:${pct}%;background:${color}; position: relative;">
                    <span class="bar-value" style="position: absolute; left: 100%; margin-left: 8px; color: var(--navy); top: 50%; transform: translateY(-50%); white-space: nowrap;">${item.value}</span>
                </div>
            </div>
        </div>\n`;
    });
    html += '</div>';
    return html;
}

/**
 * Custom UI Parser: Program Row List
 */
function parseProgList(mdText) {
    const rows = mdText.trim().split('\n').filter(r => !r.match(/^[|\s:\-]+$/));
    if (rows.length < 2) return '';
    
    let html = '';
    // Process rows skipping the header
    for (let i = 1; i < rows.length; i++) {
        let cleanRow = rows[i].trim().replace(/^\||\|$/g, '');
        const cols = cleanRow.split('|').map(c => c.trim());
        if (cols.length >= 2) {
            const label = cols[0];
            const value = cols[1];
            // Skip header or total rows just in case
            if (label.toLowerCase() !== 'total' && !label.toLowerCase().includes('total number')) {
                html += `<div class="prog-row"><span class="prog-name">${label}</span><span class="prog-num">${value}</span></div>\n`;
            }
        }
    }
    return html;
}

/**
 * Helper Function: Standard Markdown Table Parser
 */
function parseMarkdownTable(mdText) {
    const rows = mdText.trim().split('\n');
    if (rows.length < 2) return ''; 

    // Standard Table styling for glossary
    let tableHtml = '<div class="glossary-table-wrap">\n<table class="glossary-table">\n';

    rows.forEach((row, index) => {
        if (row.trim().match(/^[|\s:\-]+$/)) return;

        let cleanRow = row.trim();
        if (cleanRow.startsWith('|')) cleanRow = cleanRow.substring(1);
        if (cleanRow.endsWith('|')) cleanRow = cleanRow.substring(0, cleanRow.length - 1);

        const columns = cleanRow.split('|').map(col => col.trim());
        let rowHtml = '  <tr>\n';

        columns.forEach(col => {
            if (index === 0) {
                rowHtml += `    <th>${col}</th>\n`;
            } else {
                rowHtml += `    <td>${col}</td>\n`;
            }
        });
        rowHtml += '  </tr>\n';

        if (index === 0) {
            tableHtml += '  <thead>\n' + rowHtml + '  </thead>\n  <tbody>\n';
        } else {
            tableHtml += rowHtml;
        }
    });

    tableHtml += '  </tbody>\n</table>\n</div>';
    return tableHtml;
}

/**
 * Logic to animate numbers counting upwards
 */
const animateNumber = (el) => {
    const target = parseFloat(el.getAttribute('data-num'));
    const prefix = el.getAttribute('data-prefix');
    const suffix = el.getAttribute('data-suffix');
    const duration = 2000;
    const start = performance.now();
    const isDecimal = target % 1 !== 0;
    
    const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        let current = target * easeProgress;
        
        if (isDecimal) {
            current = current.toFixed(1);
        } else {
            current = Math.floor(current).toLocaleString();
        }
        
        el.innerText = `${prefix}${current}${suffix}`;
        
        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            el.innerText = el.getAttribute('data-target-text');
        }
    };
    requestAnimationFrame(step);
};

/**
 * Fade-in animations via Intersection Observer
 */
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const el = entry.target;
            if (el.classList.contains('animate-in')) el.classList.add('is-visible');
            if (el.classList.contains('kinetic-num')) {
                animateNumber(el);
                el.classList.remove('kinetic-num'); // Stop double-firing
            }
            observer.unobserve(el);
        }
    });
}, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });

// The Dynamic Index Builder has been fully integrated into the populateDOM function.

/**
 * Print Failsafe: Force all kinetic numbers to their final values instantly before the print dialog opens
 */
window.addEventListener('beforeprint', () => {
    document.querySelectorAll('.kinetic-num').forEach(el => {
        const targetText = el.getAttribute('data-target-text');
        if (targetText) el.innerText = targetText;
        el.classList.remove('kinetic-num'); // Prevent observer from re-triggering
    });
});
