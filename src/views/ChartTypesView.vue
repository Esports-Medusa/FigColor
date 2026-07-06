<template>
  <div class="chart-types-view">
    <header class="page-header">
      <h1 class="page-title">Chart Type Guide</h1>
      <p class="page-description">
        Choose the right color palette for your scientific visualization.
      </p>
    </header>

    <div class="chart-types-list">
      <article class="chart-type-item">
        <div class="chart-type-icon">📈</div>
        <div class="chart-type-content">
          <h2 class="chart-type-title">Line Chart</h2>
          <p class="chart-type-description">
            Suitable for continuous trends over time or continuous variables.
            Recommended for showing changes and trends in data.
          </p>
          <div class="chart-type-tips">
            <h3>Recommendations:</h3>
            <ul>
              <li>Use 2-5 colors for multiple lines</li>
              <li>Ensure sufficient contrast between lines</li>
              <li>Consider using dashed/dotted styles for additional differentiation</li>
              <li>Avoid rainbow colormaps for scientific accuracy</li>
            </ul>
          </div>
        </div>
      </article>

      <article class="chart-type-item">
        <div class="chart-type-icon">📊</div>
        <div class="chart-type-content">
          <h2 class="chart-type-title">Bar Chart</h2>
          <p class="chart-type-description">
            Suitable for categorical comparisons. Use categorical palettes to distinguish groups.
          </p>
          <div class="chart-type-tips">
            <h3>Recommendations:</h3>
            <ul>
              <li>Use categorical or qualitative palettes</li>
              <li>Ensure each bar is clearly distinguishable</li>
              <li>Consider colorblind-safe options for accessibility</li>
              <li>Limit to 4-6 categories for clarity</li>
            </ul>
          </div>
        </div>
      </article>

      <article class="chart-type-item">
        <div class="chart-type-icon">🔵</div>
        <div class="chart-type-content">
          <h2 class="chart-type-title">Scatter Plot</h2>
          <p class="chart-type-description">
            Suitable for grouped point distributions. Pay attention to transparency and contrast.
          </p>
          <div class="chart-type-tips">
            <h3>Recommendations:</h3>
            <ul>
              <li>Use transparency to handle overlapping points</li>
              <li>Ensure high contrast for different groups</li>
              <li>Consider using distinct shapes combined with colors</li>
              <li>Avoid overly saturated colors</li>
            </ul>
          </div>
        </div>
      </article>

      <article class="chart-type-item">
        <div class="chart-type-icon">🗺️</div>
        <div class="chart-type-content">
          <h2 class="chart-type-title">Heatmap</h2>
          <p class="chart-type-description">
            Suitable for matrix data visualization. Use sequential or diverging palettes.
          </p>
          <div class="chart-type-tips">
            <h3>Recommendations:</h3>
            <ul>
              <li>Use sequential palettes for single-direction data</li>
              <li>Use diverging palettes for data with a meaningful center</li>
              <li>Ensure consistent color scaling</li>
              <li>Consider adding a colorbar for reference</li>
            </ul>
          </div>
        </div>
      </article>

      <article class="chart-type-item">
        <div class="chart-type-icon">📦</div>
        <div class="chart-type-content">
          <h2 class="chart-type-title">Boxplot</h2>
          <p class="chart-type-description">
            Suitable for showing distributions across a small number of categories.
          </p>
          <div class="chart-type-tips">
            <h3>Recommendations:</h3>
            <ul>
              <li>Use high contrast colors for different groups</li>
              <li>Avoid overly saturated colors</li>
              <li>Consider using notches to indicate median confidence</li>
              <li>Limit the number of groups to avoid visual clutter</li>
            </ul>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
</script>

<style scoped>
.chart-types-view {
  padding: 2rem 0;
}

.page-header {
  margin-bottom: 2.5rem;
}

.page-title {
  font-size: 2rem;
  font-weight: 700;
  color: #333;
  margin-bottom: 0.5rem;
}

.page-description {
  font-size: 1.125rem;
  color: #666;
}

.chart-types-list {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.chart-type-item {
  display: flex;
  gap: 1.5rem;
  padding: 1.5rem;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.chart-type-icon {
  font-size: 2.5rem;
  flex-shrink: 0;
}

.chart-type-content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.chart-type-title {
  font-size: 1.25rem;
  font-weight: 600;
  color: #333;
}

.chart-type-description {
  font-size: 0.9375rem;
  color: #666;
  line-height: 1.6;
}

.chart-type-tips {
  margin-top: 0.5rem;
  padding: 1rem;
  background: #f5f5f7;
  border-radius: 6px;
}

.chart-type-tips h3 {
  font-size: 0.875rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 0.5rem;
}

.chart-type-tips ul {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding-left: 1rem;
  list-style: disc;
}

.chart-type-tips li {
  font-size: 0.875rem;
  color: #555;
}

@media (max-width: 768px) {
  .chart-type-item {
    flex-direction: column;
    gap: 1rem;
  }
}
</style>
