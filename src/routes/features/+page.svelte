<script lang="ts">
  import AppLayout from "../../lib/components/AppLayout.svelte";
  import { goto } from "$app/navigation";
  import { ArrowLeftIcon } from "lucide-svelte";

  function goBack() {
    goto("/");
  }

  // Sample features data
  const features = [
    {
      id: 1,
      title: "Secure Authentication",
      description:
        "Enterprise-grade security with Supabase Auth, encrypted sessions, and secure token management.",
      icon: "🔐",
      status: "active",
      category: "Security",
    },
  ];

  function getStatusBadge(status: string) {
    switch (status) {
      case "active":
        return { class: "badge-success", text: "Active" };
      case "coming-soon":
        return { class: "badge-warning", text: "Coming Soon" };
      case "development":
        return { class: "badge-info", text: "In Development" };
      default:
        return { class: "badge-ghost", text: "Unknown" };
    }
  }
</script>

<AppLayout>
  <div class="w-full max-w-4xl mx-auto">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-4">
        <button
          class="btn btn-ghost btn-sm"
          onclick={goBack}
          aria-label="Go back to home page"
        >
          <ArrowLeftIcon class="w-4 h-4 mr-1" />
        </button>
        <h1 class="text-3xl font-bold text-primary">Features</h1>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {#each features as feature (feature.id)}
        <div
          class="card bg-base-100 shadow-xl hover:shadow-2xl transition-shadow duration-300"
        >
          <div class="card-body">
            <div class="flex items-start justify-between mb-4">
              <div class="text-4xl">{feature.icon}</div>
              <div class="badge {getStatusBadge(feature.status).class}">
                {getStatusBadge(feature.status).text}
              </div>
            </div>

            <h2 class="card-title text-lg mb-2">{feature.title}</h2>
            <p class="text-base-content/70 text-sm mb-4">
              {feature.description}
            </p>

            <div class="card-actions justify-between items-center">
              <div class="badge badge-outline badge-sm">{feature.category}</div>
              <button
                class="btn btn-primary btn-sm"
                disabled={feature.status !== "active"}
              >
                {#if feature.status === "active"}
                  Try Now
                {:else}
                  Learn More
                {/if}
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  </div>
</AppLayout>
