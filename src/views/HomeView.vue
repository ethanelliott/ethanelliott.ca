<template>
  <main>
    <div class="title">
      <div class="logo">
        <div class="bracket">[</div>
        <div class="backwards-e">E</div>
        <div class="e">E</div>
        <div class="bracket">]</div>
      </div>
    </div>
    <div style="display: flex; justify-content: center; align-items: center">
      <button @click="more">
        <svg
          style="width: 32px; height: 32px"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
        >
          <path
            fill="#ffffff"
            d="M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z"
          />
        </svg>
      </button>
    </div>
  </main>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";

const router = useRouter();

function more() {
  router.push("/about");
}
</script>
