<script lang="ts">
  import { onMount } from 'svelte';
  import { databaseStore, type Profile } from '../stores/database';
  import { authStore } from '../stores/supabaseAuth';

  let isEditing = false;
  let formData = {
    username: '',
    full_name: '',
    avatar_url: ''
  };
  let usernameAvailable = true;
  let checkingUsername = false;

  $: profile = $databaseStore.currentProfile;
  $: isLoading = $databaseStore.isLoading;
  $: error = $databaseStore.error;
  $: user = $authStore.user;

  onMount(async () => {
    if (user?.id) {
      await databaseStore.getUserProfile(user.id);
      
      // Initialize form data with current profile
      if (profile) {
        formData = {
          username: profile.username || '',
          full_name: profile.full_name || '',
          avatar_url: profile.avatar_url || ''
        };
      }
    }
  });

  async function checkUsernameAvailability() {
    if (!formData.username || formData.username.length < 3) return;
    if (formData.username === profile?.username) {
      usernameAvailable = true;
      return;
    }

    checkingUsername = true;
    usernameAvailable = await databaseStore.checkUsernameAvailability(formData.username);
    checkingUsername = false;
  }

  async function saveProfile() {
    if (!user?.id) return;

    const updates: any = {};
    if (formData.username !== profile?.username) updates.username = formData.username;
    if (formData.full_name !== profile?.full_name) updates.full_name = formData.full_name;
    if (formData.avatar_url !== profile?.avatar_url) updates.avatar_url = formData.avatar_url;

    if (Object.keys(updates).length === 0) {
      isEditing = false;
      return;
    }

    if (profile) {
      await databaseStore.updateUserProfile(user.id, updates);
    } else {
      await databaseStore.createUserProfile(user.id, formData.full_name, formData.avatar_url);
    }

    if (!$databaseStore.error) {
      isEditing = false;
    }
  }

  function cancelEdit() {
    isEditing = false;
    // Reset form data
    if (profile) {
      formData = {
        username: profile.username || '',
        full_name: profile.full_name || '',
        avatar_url: profile.avatar_url || ''
      };
    }
    databaseStore.clearError();
  }
</script>

<div class="card bg-base-100 shadow-xl">
  <div class="card-body">
    <h2 class="card-title">Profile Information</h2>
    
    {#if error}
      <div class="alert alert-error">
        <span>{error}</span>
        <button class="btn btn-sm btn-ghost" onclick={() => databaseStore.clearError()}>
          ✕
        </button>
      </div>
    {/if}

    {#if isLoading}
      <div class="flex justify-center p-4">
        <span class="loading loading-spinner loading-md"></span>
      </div>
    {:else if !isEditing}
      <!-- Display Mode -->
      <div class="space-y-4">
        {#if profile?.avatar_url}
          <div class="avatar">
            <div class="w-20 rounded-full">
              <img src={profile.avatar_url} alt="Profile avatar" />
            </div>
          </div>
        {:else}
          <div class="avatar placeholder">
            <div class="bg-neutral text-neutral-content rounded-full w-20">
              <span class="text-2xl">{profile?.full_name?.charAt(0) || user?.email?.charAt(0) || '?'}</span>
            </div>
          </div>
        {/if}

        <div class="grid grid-cols-1 gap-4">
          <div>
            <label class="label">
              <span class="label-text font-semibold">Email</span>
            </label>
            <input 
              type="email" 
              class="input input-bordered w-full" 
              value={user?.email || ''} 
              readonly 
            />
          </div>

          <div>
            <label class="label">
              <span class="label-text font-semibold">Username</span>
            </label>
            <input 
              type="text" 
              class="input input-bordered w-full" 
              value={profile?.username || 'Not set'} 
              readonly 
            />
          </div>

          <div>
            <label class="label">
              <span class="label-text font-semibold">Full Name</span>
            </label>
            <input 
              type="text" 
              class="input input-bordered w-full" 
              value={profile?.full_name || 'Not set'} 
              readonly 
            />
          </div>

          {#if profile?.updated_at}
            <div>
              <label class="label">
                <span class="label-text font-semibold">Last Updated</span>
              </label>
              <input 
                type="text" 
                class="input input-bordered w-full" 
                value={new Date(profile.updated_at).toLocaleDateString()} 
                readonly 
              />
            </div>
          {/if}
        </div>

        <div class="card-actions justify-end">
          <button class="btn btn-primary" onclick={() => isEditing = true}>
            Edit Profile
          </button>
        </div>
      </div>
    {:else}
      <!-- Edit Mode -->
      <form onsubmit|preventDefault={saveProfile} class="space-y-4">
        <div>
          <label class="label" for="username-input">
            <span class="label-text font-semibold">Username</span>
          </label>
          <input 
            id="username-input"
            type="text" 
            class="input input-bordered w-full"
            class:input-error={!usernameAvailable}
            class:input-success={usernameAvailable && formData.username.length >= 3}
            bind:value={formData.username}
            onblur={checkUsernameAvailability}
            placeholder="Enter username (min 3 characters)"
            minlength="3"
          />
          {#if checkingUsername}
            <div class="label">
              <span class="label-text-alt">Checking availability...</span>
            </div>
          {:else if formData.username.length >= 3}
            <div class="label">
              <span class="label-text-alt" class:text-error={!usernameAvailable} class:text-success={usernameAvailable}>
                {usernameAvailable ? 'Username available' : 'Username already taken'}
              </span>
            </div>
          {/if}
        </div>

        <div>
          <label class="label" for="fullname-input">
            <span class="label-text font-semibold">Full Name</span>
          </label>
          <input 
            id="fullname-input"
            type="text" 
            class="input input-bordered w-full"
            bind:value={formData.full_name}
            placeholder="Enter your full name"
          />
        </div>

        <div>
          <label class="label" for="avatar-input">
            <span class="label-text font-semibold">Avatar URL</span>
          </label>
          <input 
            id="avatar-input"
            type="url" 
            class="input input-bordered w-full"
            bind:value={formData.avatar_url}
            placeholder="https://example.com/avatar.jpg"
          />
          {#if formData.avatar_url}
            <div class="mt-2">
              <div class="avatar">
                <div class="w-16 rounded-full">
                  <img src={formData.avatar_url} alt="Preview" onerror="this.style.display='none'" />
                </div>
              </div>
            </div>
          {/if}
        </div>

        <div class="card-actions justify-end space-x-2">
          <button type="button" class="btn btn-ghost" onclick={cancelEdit}>
            Cancel
          </button>
          <button 
            type="submit" 
            class="btn btn-primary"
            disabled={isLoading || !usernameAvailable || (formData.username.length > 0 && formData.username.length < 3)}
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    {/if}
  </div>
</div>
