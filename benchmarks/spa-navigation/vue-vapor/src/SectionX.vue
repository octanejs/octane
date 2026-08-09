<script setup vapor>
import TreeNode from './TreeNode.vue';
import { NESTED_D } from './state.js';
</script>

<template>
	<div class="section" data-section="x">
		<TreeNode :depth="NESTED_D" path="x" />
	</div>
</template>
